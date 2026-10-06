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
 * Put SQLite into WAL, once per process.
 *
 * The default rollback journal takes an exclusive lock for the whole of a
 * write transaction, and this application has a tick engine writing every five
 * seconds — on a month rollover, for considerably longer. Every request-path
 * write was queueing behind that, registration and sign-in included.
 *
 * WAL lets readers run against the last committed snapshot while a write is in
 * flight, and `busy_timeout` makes a would-be writer wait its turn instead of
 * failing immediately with SQLITE_BUSY. `journal_mode` persists in the file;
 * `busy_timeout` is per-connection, which is why this runs on a pool that is
 * deliberately kept small.
 *
 * Non-fatal on purpose: if these cannot be applied the application still
 * works, just with the old locking behaviour.
 */
export function tuneSqlite(): Promise<void> {
  globalForPrisma.prismaTuned ??= (async () => {
    try {
      await prisma.$executeRawUnsafe("PRAGMA journal_mode = WAL");
      await prisma.$executeRawUnsafe("PRAGMA busy_timeout = 15000");
      // NORMAL is the recommended pairing with WAL: a commit no longer waits
      // on an fsync, and the only exposure is losing the last few commits to a
      // host crash — which for a simulation that write-behinds every five
      // seconds is already the accepted failure mode.
      await prisma.$executeRawUnsafe("PRAGMA synchronous = NORMAL");
    } catch (err) {
      console.error("[db] could not apply SQLite pragmas", err);
    }
  })();
  return globalForPrisma.prismaTuned;
}
