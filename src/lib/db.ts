import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaTuned?: Promise<void>;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Pragmas worth having on a database with a background writer.
 *
 * `journal_mode` persists in the file; the other two are per-connection and
 * are reapplied cheaply on each call.
 *
 * All three go through `$queryRawUnsafe`, not `$executeRawUnsafe`. Most
 * PRAGMA statements return a row — `journal_mode = WAL` answers "wal" — and
 * the execute path rejects that outright with "Execute returned results, which
 * is not allowed in SQLite". That failure is how WAL silently never got
 * applied in production: the first statement threw, and the `busy_timeout`
 * behind it never ran at all.
 */
const PRAGMAS = [
  // Readers no longer block the writer, so a page load during the engine's
  // flush is served from the last committed snapshot.
  "PRAGMA journal_mode = WAL",
  // A would-be writer waits its turn instead of failing instantly. Without
  // this, a request-path insert landing mid-flush gets SQLITE_BUSY and the
  // caller sees a 500.
  "PRAGMA busy_timeout = 20000",
  // The recommended pairing with WAL: a commit no longer waits on an fsync.
  // The exposure is losing the last few commits to a host crash, which for a
  // simulation that write-behinds every five seconds is already the accepted
  // failure mode.
  "PRAGMA synchronous = NORMAL",
];

/** Apply the pragmas, once per process. Each is independent of the others. */
export function tuneSqlite(): Promise<void> {
  globalForPrisma.prismaTuned ??= (async () => {
    for (const pragma of PRAGMAS) {
      try {
        const result = await prisma.$queryRawUnsafe(pragma);
        // BigInt-safe: `busy_timeout` answers with a 64-bit integer, which
        // plain JSON.stringify throws on. Logging must not be the thing that
        // makes a pragma look like it failed.
        console.log(
          `[db] ${pragma} -> ${JSON.stringify(result, (_k, v) =>
            typeof v === "bigint" ? v.toString() : v,
          )}`,
        );
      } catch (err) {
        // Non-fatal: the application still works, just with worse locking.
        console.error(`[db] ${pragma} failed`, err);
      }
    }
  })();
  return globalForPrisma.prismaTuned;
}

/** Prisma error codes worth another go: the database was busy, not wrong. */
const TRANSIENT = new Set([
  "P1008", // socket timeout — the query waited longer than the client allows
  "P2024", // timed out fetching a connection from the pool
  "P2034", // write conflict / deadlock
  "P2010", // raw query failed; covers SQLITE_BUSY surfacing as a raw error
]);

function isTransient(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code && TRANSIENT.has(code)) return true;
  const message = String((err as { message?: string } | null)?.message ?? "");
  return /database is locked|busy|socket timeout/i.test(message);
}

/**
 * Retry a write that lost a race with the tick engine.
 *
 * The engine holds a write transaction every five seconds, and on a month
 * rollover it holds one for considerably longer — long enough to outlast the
 * client's socket timeout. A sign-in that happens to land inside that window
 * failed outright, which is what made signing in need a second or third go.
 *
 * Only transient faults are retried; a wrong password or a duplicate email
 * fails immediately, as it should.
 */
export async function withWriteRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 4,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransient(err) || attempt === attempts) throw err;
      lastError = err;
      // Backs off past a flush rather than hammering the lock.
      const wait = 250 * 2 ** (attempt - 1);
      console.warn(`[db] ${label} busy (attempt ${attempt}); retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError;
}
