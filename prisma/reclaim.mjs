/**
 * Pre-migration disk reclaim.
 *
 * The append-only tables had no retention. Equity points were written on every
 * write-behind flush — roughly one row every five seconds of wall time — and
 * price points land per artist per simulated month close, which at 43200x is a
 * month a minute. Left alone for a few weeks that filled the 500MB volume, and
 * a full SQLite file fails every write: `database or disk is full`. The clock
 * kept ticking against a database that could no longer record anything, and
 * `migrate deploy` could not run either, so deploys stopped landing.
 *
 * This runs before the migration, on the raw file, and does three things:
 *
 *   1. Checkpoints and truncates the WAL. A write-ahead log that is never
 *      checkpointed grows without bound on its own.
 *   2. Deletes rows beyond each table's retention window, in batches, so no
 *      single statement needs a journal larger than the free space it is
 *      trying to create.
 *   3. Compacts into a fresh file and swaps it in, if the filesystem has room
 *      for the copy. Deleting alone only moves pages onto SQLite's freelist:
 *      writes start working again immediately, but the file stays its old size
 *      until it is rebuilt.
 *
 * Deliberately raw SQL rather than the Prisma client: this runs *before*
 * `migrate deploy`, so the schema on disk is the old one and the generated
 * client would not match it.
 */
import {
  copyFileSync, existsSync, renameSync, statfsSync, statSync, truncateSync, unlinkSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";

const url = process.env.DATABASE_URL ?? "file:/data/xcadence.db";
const path = url.replace(/^file:/, "");

/**
 * How many rows each table keeps, newest first. Every figure is comfortably
 * above what any page actually reads — the charts ask for 800 points and the
 * covariance work for 900 per artist — so this is a ceiling, not a budget.
 */
const RETENTION = [
  ["EquityPoint", 20_000],
  ["IndexPoint", 20_000],
  ["PricePoint", 400_000],
  // Bot fills only. A person's own trades are their blotter and their realised
  // P&L history; there are a handful of them against the bots' millions, and
  // trimming by id alone would delete them to make room for machine noise.
  ["Trade", 25_000, "actor <> 'USER'"],
  ["MarketEvent", 20_000],
  ["RoyaltyPayment", 50_000],
  // Normally trimmed by month key as the clock rolls over. Included as a
  // backstop: once writes started failing, that pruning stopped running too.
  ["ArtistMonth", 120_000],
];

/**
 * Rows per DELETE. Small on purpose — the rollback journal for one statement
 * is written to its own file, and on a volume with megabytes free a single
 * large DELETE is exactly the statement that cannot find room to record how
 * to undo itself. After the first batch commits, its pages are on the
 * freelist and the ones that follow reuse them, so the file stops growing.
 */
const BATCH = 2_000;

/**
 * Where to build a compacted copy when the volume has no room for one. The
 * container's own filesystem is ephemeral, which is fine: the copy only has
 * to outlive the few seconds it takes to write it back.
 */
const SCRATCH = process.env.RECLAIM_SCRATCH ?? "/tmp";

if (!existsSync(path)) {
  console.log(`[reclaim] no database at ${path} yet — nothing to do`);
  process.exit(0);
}

const before = sizeOf(path);
console.log(`[reclaim] ${path} is ${mb(before)}`);

const db = new DatabaseSync(path);

// A WAL that nobody checkpointed is its own leak, and TRUNCATE is the only
// mode that gives the space back to the filesystem rather than just marking
// the log reusable.
try {
  const [wal] = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").all();
  console.log(`[reclaim] wal_checkpoint(TRUNCATE) -> ${JSON.stringify(wal)}`);
} catch (err) {
  console.log(`[reclaim] wal checkpoint skipped: ${err.message}`);
}

const tableCounts = [];

for (const [table, keep, only] of RETENTION) {
  if (!hasTable(db, table)) continue;
  // `only` narrows both the count and the delete to the rows that are
  // eligible, so a table can be trimmed without touching the rows in it that
  // somebody is going to want to read back.
  const scope = only ? `WHERE ${only}` : "";
  const eligible = Number(
    db.prepare(`SELECT COUNT(*) AS n FROM "${table}" ${scope}`).get().n,
  );
  const total = count(db, table);
  if (eligible <= keep) {
    console.log(`[reclaim] ${table}: ${total} rows, within ${keep} — kept`);
    tableCounts.push([table, total]);
    continue;
  }

  // The id of the oldest eligible row worth keeping. Computed once:
  // re-running the offset scan on every batch would be quadratic.
  const cut = db
    .prepare(`SELECT id FROM "${table}" ${scope} ORDER BY id DESC LIMIT 1 OFFSET ?`)
    .get(keep)?.id;
  if (cut == null) continue;

  // Batched so the rollback journal for any one statement stays small. On a
  // volume with megabytes free, a single DELETE of 100k rows is exactly the
  // statement that cannot find room to record how to undo itself.
  const stmt = db.prepare(
    `DELETE FROM "${table}" WHERE id IN (
       SELECT id FROM "${table}"
       WHERE id < ?${only ? ` AND ${only}` : ""}
       ORDER BY id LIMIT ${BATCH}
     )`,
  );
  let removed = 0;
  for (;;) {
    const { changes } = stmt.run(cut);
    if (!changes) break;
    removed += Number(changes);
  }
  const left = count(db, table);
  tableCounts.push([table, left]);
  console.log(`[reclaim] ${table}: ${total} rows -> ${left} (−${removed})`);
}

// Rebuild into a fresh file to actually shrink it, but only when the volume
// can hold the copy. On a nearly-full disk a failed VACUUM is worse than no
// VACUUM: the deletes above have already made the database writable, so there
// is nothing to gain by risking a half-written temp file.
const live = pageBytes(db);
const free = freeBytes(path);
const target = `${path}.compact`;
console.log(`[reclaim] live data ${mb(live)}, filesystem free ${mb(free)}`);

if (live * 1.3 < free) {
  try {
    for (const stale of [target, `${target}-wal`, `${target}-shm`]) {
      if (existsSync(stale)) unlinkSync(stale);
    }
    db.prepare(`VACUUM INTO '${target.replace(/'/g, "''")}'`).run();
    db.close();
    renameSync(target, path);
    for (const stale of [`${path}-wal`, `${path}-shm`]) {
      if (existsSync(stale)) unlinkSync(stale);
    }
    console.log(`[reclaim] compacted ${mb(before)} -> ${mb(sizeOf(path))}`);
  } catch (err) {
    console.log(`[reclaim] compaction failed, carrying on: ${err.message}`);
    if (existsSync(target)) unlinkSync(target);
  }
} else if (live * 3 < before && live * 1.3 < freeBytes(SCRATCH)) {
  // The volume itself has no room for a copy, but the container's own
  // filesystem does — and after the deletes above there are only a few MB of
  // live pages inside a file hundreds of MB wide.
  //
  // So: build the compacted copy outside the volume, prove it is sound, and
  // only then truncate the original to give the space back. Truncating rather
  // than renaming is the point — a rename on the same filesystem frees
  // nothing, and nothing can be written to /data until something does.
  const scratch = `${SCRATCH}/xcadence-compact-${process.pid}.db`;
  let swapped = false;
  try {
    db.prepare(`VACUUM INTO '${scratch.replace(/'/g, "''")}'`).run();
    db.close();
    verify(scratch, tableCounts);

    // From here the compacted copy on scratch is the only copy, for as long
    // as it takes to write a few MB. That is the cost of the trade; the
    // alternative is a volume that stays permanently full.
    truncateSync(path, 0);
    copyFileSync(scratch, path);
    verify(path, tableCounts);
    swapped = true;
    for (const stale of [`${path}-wal`, `${path}-shm`]) {
      if (existsSync(stale)) unlinkSync(stale);
    }
    console.log(`[reclaim] compacted via ${SCRATCH}: ${mb(before)} -> ${mb(sizeOf(path))}`);
  } catch (err) {
    console.log(`[reclaim] scratch compaction failed: ${err.message}`);
    // The scratch copy is deliberately left behind when the swap did not
    // complete. If the truncate landed and the copy did not, that file is the
    // only intact database there is, and deleting it to tidy up would be the
    // one unrecoverable thing this script could do.
    if (existsSync(scratch)) {
      console.log(`[reclaim] compacted copy kept at ${scratch}`);
    }
  }
  if (swapped && existsSync(scratch)) unlinkSync(scratch);
} else {
  db.close();
  console.log(
    `[reclaim] not enough room to compact — the freed pages are on SQLite's ` +
      `freelist and will be reused, so writes work; the file stays ${mb(sizeOf(path))}`,
  );
}

/**
 * A compacted copy is only usable if it passes SQLite's own structural check
 * *and* still holds the rows we expect. Either failing throws, which leaves
 * the original in place.
 */
function verify(file, expected) {
  const check = new DatabaseSync(file, { readOnly: true });
  try {
    const { integrity_check: result } = check.prepare("PRAGMA integrity_check").get();
    if (result !== "ok") throw new Error(`integrity_check says ${result}`);
    for (const [table, n] of expected) {
      const got = count(check, table);
      if (got !== n) throw new Error(`${table} has ${got} rows, expected ${n}`);
    }
  } finally {
    check.close();
  }
}

function hasTable(db, name) {
  return !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get(name);
}

function count(db, table) {
  return Number(db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n);
}

function pageBytes(db) {
  const page = Number(db.prepare("PRAGMA page_size").get().page_size);
  const total = Number(db.prepare("PRAGMA page_count").get().page_count);
  const freelist = Number(db.prepare("PRAGMA freelist_count").get().freelist_count);
  return (total - freelist) * page;
}

function sizeOf(p) {
  let n = 0;
  for (const f of [p, `${p}-wal`, `${p}-shm`]) {
    try {
      n += statSync(f).size;
    } catch {
      /* not present */
    }
  }
  return n;
}

function freeBytes(p) {
  try {
    const s = statfsSync(p);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return 0;
  }
}

function mb(n) {
  return `${(n / 1_048_576).toFixed(1)}MB`;
}
