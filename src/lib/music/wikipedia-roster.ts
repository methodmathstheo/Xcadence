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
const UA = "xcadence/0.1 ( royalty-exchange-simulation; roster discovery )";
const STALE_MS = 7 * 24 * 3600 * 1000;
/** Boot waits on this, so it gives up rather than run long. */
const DEADLINE_MS = 240_000;

/**
 * Category → chart and country. Order matters where an artist sits in more
 * than one: the first match wins, so rap before R&B keeps Drake on the rap
 * chart. A category that does not exist yields nothing and is logged.
 */
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
 * Requests are paced and retried with backoff: the first pass fired the
 * categories back to back and Wikipedia throttled a good share of them.
 */
async function categoryMembers(title: string, deadline: number): Promise<string[] | null> {
  const titles: string[] = [];
  let cont: string | undefined;
  for (let page = 0; page < 40; page++) {
    if (Date.now() > deadline) return titles;
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
      if (attempt > 0) await sleep(1500 * 2 ** (attempt - 1));
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
      return titles.length ? titles : null;
    }
    if (data.error) {
      // The API answered: the category is invalid or otherwise unusable.
      // That is an answer, not a failure to read, so the pass stays complete.
      console.warn(`[roster] Category:${title}: ${data.error.code} ${data.error.info ?? ""}`);
      return titles;
    }
    for (const m of data.query?.categorymembers ?? []) titles.push(m.title);
    cont = data.continue?.cmcontinue;
    await sleep(300);
    if (!cont) break;
  }
  return titles;
}

/** Pull every category and replace the stored candidates. Returns the count. */
export async function refreshRosterCandidates(): Promise<number> {
  const deadline = Date.now() + DEADLINE_MS;
  const byKey = new Map<string, Candidate>();
  const missing: string[] = [];
  let fetched = 0;
  let outOfTime = false;
  for (const c of CATEGORIES) {
    if (Date.now() > deadline) {
      console.warn(`[roster] out of time after ${fetched} categories; the rest wait for the next refresh`);
      outOfTime = true;
      break;
    }
    const titles = await categoryMembers(c.title, deadline);
    if (titles === null) {
      missing.push(c.title);
      continue;
    }
    fetched++;
    for (const t of titles) {
      if (NOT_AN_ARTIST.test(t)) continue;
      const name = displayName(t);
      const key = nameKey(name);
      if (!key || byKey.has(key)) continue;
      byKey.set(key, { key, name, wikiTitle: t, chart: c.chart, country: c.country, source: c.title });
    }
  }
  if (missing.length) console.warn(`[roster] ${missing.length} categories unread this pass: ${missing.join("; ")}`);
  if (byKey.size < 500) {
    console.warn(`[roster] only ${byKey.size} candidates found; keeping the previous set`);
    return 0;
  }
  // Complete means every category was read. An unread one (throttled, timed
  // out) is not an answer, so the pass is retried until it is.
  const complete = !outOfTime && missing.length === 0;
  // A partial pass is stored but dated stale, so the next boot tries again.
  const now = complete ? Date.now() : Date.now() - STALE_MS - 1;
  const rows = [...byKey.values()];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`DELETE FROM "RosterCandidate"`);
    for (let i = 0; i < rows.length; i += 500) {
      const values = rows
        .slice(i, i + 500)
        .map((r) => `('${r.key}',${q(r.name)},${q(r.wikiTitle)},'${r.chart}',${r.country ? q(r.country) : "NULL"},${q(r.source)},${now})`)
        .join(",");
      await tx.$executeRawUnsafe(
        `INSERT INTO "RosterCandidate" ("key","name","wikiTitle","chart","country","source","fetchedAt") VALUES ${values}`,
      );
    }
  }, { timeout: 120_000 });
  console.log(`[roster] ${rows.length} candidates from ${fetched} Wikipedia categories${complete ? "" : " (partial; retrying next boot)"}`);
  return rows.length;
}

function q(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Refresh if there are no candidates or they are stale. Never throws. */
export async function ensureRosterCandidates(): Promise<void> {
  try {
    const latest = (await prisma.$queryRawUnsafe(
      `SELECT MAX("fetchedAt") AS t, COUNT(*) AS n, COUNT(DISTINCT "chart") AS charts FROM "RosterCandidate"`,
    )) as { t: number | null; n: number | bigint; charts: number | bigint }[];
    const n = Number(latest[0]?.n ?? 0);
    const t = Number(latest[0]?.t ?? 0);
    const charts = Number(latest[0]?.charts ?? 0);
    // A set with no R&B or house candidates in it is not a complete pass,
    // whatever it was dated.
    if (n > 0 && charts >= 3 && Date.now() - t < STALE_MS) return;
    await refreshRosterCandidates();
  } catch (e) {
    console.error("[roster] candidate refresh failed", e);
  }
}

export async function loadRosterCandidates(): Promise<Candidate[]> {
  const rows = await prisma.rosterCandidate.findMany();
  return rows.map((r) => ({
    key: r.key,
    name: r.name,
    wikiTitle: r.wikiTitle,
    chart: r.chart as Chart,
    country: r.country ?? undefined,
    source: r.source,
  }));
}
