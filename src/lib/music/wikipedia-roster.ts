/**
 * Roster discovery: every artist Wikipedia files under the venue's genres.
 *
 * The hand-written roster in names.ts is a starting point, not a census. To
 * list every established act, the venue asks Wikipedia which articles sit in
 * the rapper, R&B and house categories — the MediaWiki API, the same open
 * source the biographies come from — and keeps each one as a candidate.
 * A candidate becomes a listing only when the public monthly-listener
 * rankings also carry it (see listeners.ts): "established" is defined by
 * that figure, not by anyone's taste. Candidates with no public figure stay
 * candidates.
 *
 * Refreshed weekly alongside the listener snapshot, so an artist who breaks
 * through is listed on the next boot after both sources carry them.
 */
import { prisma } from "@/lib/db";
import { nameKey } from "@/lib/music/name-key";
import type { Chart } from "@/lib/sim/roster-data";

const API = "https://en.wikipedia.org/w/api.php";
/** Wikimedia asks for a descriptive agent with a way to reach the operator. */
const UA = "xcadence/0.1 (+https://www.xcadencemusic.ai; roster discovery; royalty-exchange simulation)";
const STALE_MS = 7 * 24 * 3600 * 1000;
/** A pass stops at its budget and leaves the rest for the next tick. */
export const TICK_BUDGET_MS = 240_000;
/** Boot waits on its pass, so it gets a shorter budget than a tick. */
export const BOOT_BUDGET_MS = 60_000;

/**
 * Category → chart and country. Order matters where an artist sits in more
 * than one: the first match wins, so rap before R&B keeps Drake on the rap
 * chart. A category that does not exist yields nothing and is logged.
 */
/**
 * Bump when the category list changes or the stored set must be rebuilt.
 * Each category's read is stamped with it, and a stamp from another version
 * does not count.
 */
const CATEGORY_SET_VERSION = "v4";

const CATEGORIES: { title: string; chart: Chart; country?: string }[] = [
  // Rap and drill
  { title: "American male rappers", chart: "rap", country: "US" },
  { title: "American women rappers", chart: "rap", country: "US" },
  { title: "American hip-hop groups", chart: "rap", country: "US" },
  { title: "American hip hop groups", chart: "rap", country: "US" },
  { title: "Canadian male rappers", chart: "rap", country: "CA" },
  { title: "Canadian women rappers", chart: "rap", country: "CA" },
  { title: "English male rappers", chart: "rap", country: "GB" },
  { title: "English women rappers", chart: "rap", country: "GB" },
  { title: "British male rappers", chart: "rap", country: "GB" },
  { title: "British women rappers", chart: "rap", country: "GB" },
  { title: "Scottish rappers", chart: "rap", country: "GB" },
  { title: "Welsh rappers", chart: "rap", country: "GB" },
  { title: "Northern Irish rappers", chart: "rap", country: "GB" },
  { title: "Irish male rappers", chart: "rap", country: "IE" },
  { title: "Irish rappers", chart: "rap", country: "IE" },
  { title: "British hip-hop groups", chart: "rap", country: "GB" },
  { title: "British hip hop groups", chart: "rap", country: "GB" },
  { title: "English hip-hop groups", chart: "rap", country: "GB" },
  { title: "English hip hop groups", chart: "rap", country: "GB" },
  { title: "Grime music artists", chart: "rap", country: "GB" },
  { title: "Grime MCs", chart: "rap", country: "GB" },
  { title: "UK drill musicians", chart: "rap", country: "GB" },
  { title: "British drill musicians", chart: "rap", country: "GB" },
  { title: "Drill musicians", chart: "rap" },
  // Era, scene and heritage categories catch rappers filed outside the
  // nationality ones; the chart is the same either way.
  { title: "21st-century American rappers", chart: "rap", country: "US" },
  { title: "20th-century American rappers", chart: "rap", country: "US" },
  { title: "African-American male rappers", chart: "rap", country: "US" },
  { title: "African-American women rappers", chart: "rap", country: "US" },
  { title: "Trap musicians", chart: "rap" },
  { title: "Southern hip hop musicians", chart: "rap", country: "US" },
  { title: "West Coast hip hop musicians", chart: "rap", country: "US" },
  { title: "East Coast hip hop musicians", chart: "rap", country: "US" },
  { title: "Midwest hip hop musicians", chart: "rap", country: "US" },
  { title: "Gangsta rappers", chart: "rap" },
  { title: "Hardcore hip hop artists", chart: "rap" },
  { title: "Alternative hip hop musicians", chart: "rap" },
  { title: "Underground rappers", chart: "rap" },
  { title: "Rappers from New York City", chart: "rap", country: "US" },
  { title: "Rappers from Atlanta", chart: "rap", country: "US" },
  { title: "Rappers from Los Angeles", chart: "rap", country: "US" },
  { title: "Rappers from Chicago", chart: "rap", country: "US" },
  { title: "Rappers from Houston", chart: "rap", country: "US" },
  { title: "Rappers from Detroit", chart: "rap", country: "US" },
  { title: "Rappers from Memphis, Tennessee", chart: "rap", country: "US" },
  { title: "Rappers from Philadelphia", chart: "rap", country: "US" },
  { title: "Rappers from Miami", chart: "rap", country: "US" },
  { title: "Rappers from New Orleans", chart: "rap", country: "US" },
  { title: "Rappers from Baltimore", chart: "rap", country: "US" },
  { title: "Rappers from Dallas", chart: "rap", country: "US" },
  { title: "Rappers from Oakland, California", chart: "rap", country: "US" },
  { title: "Rappers from Toronto", chart: "rap", country: "CA" },
  { title: "21st-century British rappers", chart: "rap", country: "GB" },
  { title: "20th-century British rappers", chart: "rap", country: "GB" },
  { title: "Black British male rappers", chart: "rap", country: "GB" },
  { title: "English hip hop musicians", chart: "rap", country: "GB" },
  { title: "British hip hop musicians", chart: "rap", country: "GB" },
  { title: "Rappers from London", chart: "rap", country: "GB" },
  { title: "Rappers from Birmingham, West Midlands", chart: "rap", country: "GB" },
  { title: "Rappers from Manchester", chart: "rap", country: "GB" },
  { title: "Australian male rappers", chart: "rap", country: "AU" },
  { title: "Australian women rappers", chart: "rap", country: "AU" },
  { title: "New Zealand rappers", chart: "rap", country: "NZ" },
  // R&B and soul
  { title: "American contemporary R&B singers", chart: "rnb", country: "US" },
  { title: "American rhythm and blues singers", chart: "rnb", country: "US" },
  { title: "American contemporary R&B musical groups", chart: "rnb", country: "US" },
  { title: "American rhythm and blues musical groups", chart: "rnb", country: "US" },
  { title: "American soul singers", chart: "rnb", country: "US" },
  { title: "American soul musical groups", chart: "rnb", country: "US" },
  { title: "American neo soul singers", chart: "rnb", country: "US" },
  { title: "Neo soul singers", chart: "rnb" },
  { title: "English contemporary R&B singers", chart: "rnb", country: "GB" },
  { title: "British contemporary R&B singers", chart: "rnb", country: "GB" },
  { title: "English soul singers", chart: "rnb", country: "GB" },
  { title: "British soul singers", chart: "rnb", country: "GB" },
  { title: "British contemporary R&B musical groups", chart: "rnb", country: "GB" },
  { title: "Canadian contemporary R&B singers", chart: "rnb", country: "CA" },
  { title: "Canadian soul singers", chart: "rnb", country: "CA" },
  { title: "Alternative R&B musicians", chart: "rnb" },
  { title: "American contemporary R&B musicians", chart: "rnb", country: "US" },
  { title: "21st-century American R&B singers", chart: "rnb", country: "US" },
  { title: "20th-century American R&B singers", chart: "rnb", country: "US" },
  { title: "New jack swing musicians", chart: "rnb", country: "US" },
  { title: "Australian contemporary R&B singers", chart: "rnb", country: "AU" },
  // House
  { title: "American house musicians", chart: "house", country: "US" },
  { title: "English house musicians", chart: "house", country: "GB" },
  { title: "British house musicians", chart: "house", country: "GB" },
  { title: "Scottish house musicians", chart: "house", country: "GB" },
  { title: "Welsh house musicians", chart: "house", country: "GB" },
  { title: "Irish house musicians", chart: "house", country: "IE" },
  { title: "Canadian house musicians", chart: "house", country: "CA" },
  { title: "Australian house musicians", chart: "house", country: "AU" },
  { title: "French house musicians", chart: "house", country: "FR" },
  { title: "German house musicians", chart: "house", country: "DE" },
  { title: "Dutch house musicians", chart: "house", country: "NL" },
  { title: "Italian house musicians", chart: "house", country: "IT" },
  { title: "Swedish house musicians", chart: "house", country: "SE" },
  { title: "Belgian house musicians", chart: "house", country: "BE" },
  { title: "Spanish house musicians", chart: "house", country: "ES" },
  { title: "South African house musicians", chart: "house", country: "ZA" },
  { title: "Tech house musicians", chart: "house" },
  { title: "Deep house musicians", chart: "house" },
  { title: "Acid house musicians", chart: "house" },
  { title: "Chicago house musicians", chart: "house", country: "US" },
  { title: "Garage house musicians", chart: "house" },
  { title: "UK garage musicians", chart: "house", country: "GB" },
  { title: "Speed garage musicians", chart: "house", country: "GB" },
  { title: "Bassline musicians", chart: "house", country: "GB" },
  { title: "House music groups", chart: "house" },
  { title: "English house music groups", chart: "house", country: "GB" },
  { title: "American house music groups", chart: "house", country: "US" },
  { title: "House music DJs", chart: "house" },
  { title: "Electro house musicians", chart: "house" },
  { title: "Progressive house musicians", chart: "house" },
  { title: "Tropical house musicians", chart: "house" },
  { title: "Future house musicians", chart: "house" },
  { title: "Afro house musicians", chart: "house" },
  { title: "Hip house musicians", chart: "house" },
  { title: "Ghetto house musicians", chart: "house" },
  { title: "Microhouse musicians", chart: "house" },
  { title: "Danish house musicians", chart: "house", country: "DK" },
  { title: "Norwegian house musicians", chart: "house", country: "NO" },
  { title: "Swiss house musicians", chart: "house", country: "CH" },
  { title: "Russian house musicians", chart: "house", country: "RU" },
  { title: "Brazilian house musicians", chart: "house", country: "BR" },
  { title: "Japanese house musicians", chart: "house", country: "JP" },
  { title: "Israeli house musicians", chart: "house", country: "IL" },
  { title: "Argentine house musicians", chart: "house", country: "AR" },
  { title: "Mexican house musicians", chart: "house", country: "MX" },
  { title: "New Zealand house musicians", chart: "house", country: "NZ" },
];

/** Article titles that are not artists, whatever category they sit in. */
const NOT_AN_ARTIST = /^(List of|Lists of|Category:|Template:)|\b(discography|filmography|awards|tour|album|song|single|mixtape|EP|concert|residency)\b/i;

export type Candidate = { key: string; name: string; wikiTitle: string; chart: Chart; country?: string; source: string };

/** "Dave (rapper)" → "Dave"; the title is kept separately for the lookup. */
export function displayName(title: string): string {
  return title.replace(/\s+\([^)]*\)\s*$/, "").trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Members of one category, following continuation. Null means the category
 * could not be read (an API error or repeated transport failure); an empty
 * array is a category that exists and has no article in it.
 *
 * Requests are paced at one a second and retried with backoff of 5, 10 and
 * 20 seconds: faster than that and Wikipedia throttles a good share of them.
 */
async function categoryMembers(title: string, deadline: number): Promise<string[] | null> {
  const titles: string[] = [];
  let cont: string | undefined;
  for (let page = 0; page < 40; page++) {
    // Cut short by the deadline means unread, not a shorter category: a
    // partial list stamped as read would silently drop its remaining members.
    if (Date.now() > deadline) return null;
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${title}`,
      cmlimit: "500",
      cmtype: "page",
      cmnamespace: "0",
      format: "json",
      formatversion: "2",
      maxlag: "5",
    });
    if (cont) params.set("cmcontinue", cont);
    type Reply = {
      error?: { code: string; info?: string };
      query?: { categorymembers?: { title: string }[] };
      continue?: { cmcontinue?: string };
    };
    let data: Reply | null = null;
    let lastStatus = "";
    for (let attempt = 0; attempt < 4 && data === null; attempt++) {
      if (attempt > 0) await sleep(5000 * 2 ** (attempt - 1));
      try {
        const res = await fetch(`${API}?${params}`, {
          headers: { "User-Agent": UA, Accept: "application/json" },
          signal: AbortSignal.timeout(20_000),
        });
        lastStatus = String(res.status);
        if (!res.ok) continue;
        const body = (await res.json()) as Reply;
        // maxlag asks the API to refuse while the database is behind; that
        // is a retry, not a missing category.
        if (body.error?.code === "maxlag") {
          lastStatus = "maxlag";
          continue;
        }
        data = body;
      } catch (e) {
        lastStatus = e instanceof Error ? e.name : "error";
      }
    }
    if (!data) {
      console.warn(`[roster] could not read Category:${title} (${lastStatus})`);
      return null;
    }
    if (data.error) {
      // The API answered: the category is invalid or otherwise unusable.
      // That is an answer, not a failure to read, so the pass stays complete.
      console.warn(`[roster] Category:${title}: ${data.error.code} ${data.error.info ?? ""}`);
      return titles;
    }
    for (const m of data.query?.categorymembers ?? []) titles.push(m.title);
    cont = data.continue?.cmcontinue;
    await sleep(1000);
    if (!cont) break;
  }
  return titles;
}

/** Lower wins where an artist sits in more than one chart's categories. */
const PRIORITY_SQL = `CASE %s WHEN 'rap' THEN 0 WHEN 'rnb' THEN 1 ELSE 2 END`;

/**
 * Read every category that has not been read (at this version) within the
 * week, and store what each one holds. Resumable by design: a category is
 * committed as soon as it is read, each one carries its own sentinel row
 * recording when, and a pass that runs out of time or gets throttled leaves
 * the rest for the next hourly tick. Returns how many categories were read.
 */
export type RefreshResult = { read: number; remaining: number };

export async function refreshRosterCandidates(budgetMs = TICK_BUDGET_MS): Promise<RefreshResult> {
  const stamps = (await prisma.$queryRawUnsafe(
    `SELECT "key", "source", "fetchedAt" FROM "RosterCandidate" WHERE substr("key", 1, 6) = '__cat:'`,
  )) as { key: string; source: string; fetchedAt: number }[];
  const readAt = new Map(
    stamps
      .filter((r) => r.source === CATEGORY_SET_VERSION)
      .map((r) => [r.key.slice("__cat:".length), Number(r.fetchedAt)] as [string, number]),
  );
  const todo = CATEGORIES.filter((c) => Date.now() - (readAt.get(c.title) ?? 0) > STALE_MS);
  if (todo.length === 0) return { read: 0, remaining: 0 };

  const deadline = Date.now() + budgetMs;
  const unread: string[] = [];
  let read = 0;
  for (const c of todo) {
    if (Date.now() > deadline) {
      console.warn(`[roster] out of time with ${todo.length - read - unread.length} categories still to read; the next tick continues`);
      break;
    }
    const titles = await categoryMembers(c.title, deadline);
    if (titles === null) {
      unread.push(c.title);
      continue;
    }
    const rows = new Map<string, Candidate>();
    for (const t of titles) {
      if (NOT_AN_ARTIST.test(t)) continue;
      const name = displayName(t);
      const key = nameKey(name);
      if (!key || key.startsWith("__") || rows.has(key)) continue;
      rows.set(key, { key, name, wikiTitle: t, chart: c.chart, country: c.country, source: c.title });
    }
    await storeCategory(c.title, [...rows.values()]);
    read++;
  }
  if (unread.length) console.warn(`[roster] ${unread.length} categories unread this pass: ${unread.join("; ")}`);
  const total = Number(
    ((await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS n FROM "RosterCandidate" WHERE substr("key", 1, 2) <> '__'`,
    )) as { n: number | bigint }[])[0]?.n ?? 0,
  );
  console.log(`[roster] read ${read} of ${todo.length} categories due; ${total} candidates stored`);
  return { read, remaining: todo.length - read };
}

/**
 * Replace one category's rows and stamp it read. A name already stored from
 * a higher-priority chart's category keeps that chart; otherwise the newer
 * read wins, so a category re-read after a week refreshes its members.
 */
async function storeCategory(title: string, rows: Candidate[]): Promise<void> {
  const now = Date.now();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `DELETE FROM "RosterCandidate" WHERE "source" = ${q(title)} AND substr("key", 1, 2) <> '__'`,
    );
    for (let i = 0; i < rows.length; i += 400) {
      const values = rows
        .slice(i, i + 400)
        .map((r) => `('${r.key}',${q(r.name)},${q(r.wikiTitle)},'${r.chart}',${r.country ? q(r.country) : "NULL"},${q(r.source)},${now})`)
        .join(",");
      await tx.$executeRawUnsafe(
        `INSERT INTO "RosterCandidate" ("key","name","wikiTitle","chart","country","source","fetchedAt") VALUES ${values} ` +
        `ON CONFLICT("key") DO UPDATE SET "name" = excluded."name", "wikiTitle" = excluded."wikiTitle", ` +
        `"chart" = excluded."chart", "country" = excluded."country", "source" = excluded."source", "fetchedAt" = excluded."fetchedAt" ` +
        `WHERE (${PRIORITY_SQL.replace("%s", 'excluded."chart"')}) <= (${PRIORITY_SQL.replace("%s", '"RosterCandidate"."chart"')})`,
      );
    }
    await tx.$executeRawUnsafe(
      `INSERT INTO "RosterCandidate" ("key","name","wikiTitle","chart","country","source","fetchedAt") ` +
      `VALUES (${q("__cat:" + title)},'','','rap',NULL,${q(CATEGORY_SET_VERSION)},${now}) ` +
      `ON CONFLICT("key") DO UPDATE SET "source" = excluded."source", "fetchedAt" = excluded."fetchedAt"`,
    );
  }, { timeout: 60_000 });
}

function q(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Read whatever is due within the budget. Never throws. */
export async function ensureRosterCandidates(budgetMs = TICK_BUDGET_MS): Promise<RefreshResult> {
  try {
    return await refreshRosterCandidates(budgetMs);
  } catch (e) {
    console.error("[roster] candidate refresh failed", e);
    return { read: 0, remaining: 0 };
  }
}

export async function loadRosterCandidates(): Promise<Candidate[]> {
  // Filtered here rather than in the query: a startsWith("__") condition
  // compiles to LIKE, where every underscore is a wildcard, and matched
  // every key on the table.
  const rows = (await prisma.rosterCandidate.findMany()).filter((r) => !r.key.startsWith("__"));
  return rows.map((r) => ({
    key: r.key,
    name: r.name,
    wikiTitle: r.wikiTitle,
    chart: r.chart as Chart,
    country: r.country ?? undefined,
    source: r.source,
  }));
}
