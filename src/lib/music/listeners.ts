/**
 * Public monthly-listener figures, used only to size each listing when it
 * opens (and, once, to resize the listings that opened before this existed).
 *
 * Source: the Spotify monthly-listener rankings published at kworb.net, a
 * long-running public chart aggregator. It lists every artist above 500,000
 * monthly listeners — around 25,000 of them — across a handful of static
 * HTML pages, which is the only broad, artist-level, cross-genre audience
 * figure that is published anywhere without a licence. Apple Music and the
 * other services publish no per-artist listener counts at all.
 *
 * The figure is a snapshot, not a feed: nothing in the market reads it after
 * the listing opens, and the methodology page says exactly that.
 */
import { prisma } from "@/lib/db";
import type { RNG } from "@/lib/rng";
import { LISTENERS_BASE, ROSTER_EXPANSION } from "@/lib/sim/roster-data";
import { nameKey } from "@/lib/music/name-key";

export { nameKey };

const PAGES = [
  "https://kworb.net/spotify/listeners.html",
  ...Array.from({ length: 10 }, (_, i) => `https://kworb.net/spotify/listeners${i + 2}.html`),
];
const UA = "xcadence/0.1 ( royalty-exchange-simulation; roster sizing )";
/** The rankings stop at this audience, so an absent artist is below it. */
export const PUBLIC_THRESHOLD = 500_000;
/** Refresh the snapshot when the stored one is older than this. */
const STALE_MS = 7 * 24 * 3600 * 1000;

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .trim();
}

/** Rows of (rank, artist, listeners) from one rankings page. */
export function parseListenersPage(html: string): { rank: number; name: string; listeners: number }[] {
  const out: { rank: number; name: string; listeners: number }[] = [];
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    if (cells.length < 3) continue;
    const rank = Number(cells[0]);
    const listeners = Number(cells[2].replace(/,/g, ""));
    if (!Number.isInteger(rank) || rank <= 0 || !cells[1] || !Number.isFinite(listeners) || listeners <= 0) continue;
    out.push({ rank, name: cells[1], listeners });
  }
  return out;
}

/** Boot waits on the refresh, so it gives up rather than run long. */
const REFRESH_DEADLINE_MS = 90_000;

async function fetchPage(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
      if (res.ok) return await res.text();
      if (res.status === 404) return null;
    } catch {
      // retried below
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  return null;
}

/**
 * Fetch the rankings and replace the stored snapshot. Returns how many rows
 * landed; zero means the fetch failed and the previous snapshot stands.
 */
export async function refreshListenerSnapshot(): Promise<number> {
  const rows: { rank: number; name: string; listeners: number }[] = [];
  const started = Date.now();
  let complete = true;
  for (const url of PAGES) {
    if (Date.now() - started > REFRESH_DEADLINE_MS) {
      console.warn(`[listeners] out of time after ${rows.length} rows; the rest of the rankings are skipped this time`);
      complete = false;
      break;
    }
    const html = await fetchPage(url);
    if (html === null) {
      console.warn(`[listeners] could not fetch ${url}`);
      if (rows.length === 0) return 0; // first page failing means no network; stop
      complete = false;
      continue;
    }
    const page = parseListenersPage(html);
    if (page.length === 0) {
      console.warn(`[listeners] no rows parsed from ${url}`);
      complete = false;
    }
    rows.push(...page);
    await new Promise((r) => setTimeout(r, 750));
  }
  if (rows.length < 100) {
    console.warn(`[listeners] only ${rows.length} rows parsed; keeping the previous snapshot`);
    return 0;
  }

  // Keyed on the normalised name; where two artists collapse to one key the
  // larger audience wins, which is the one a roster name most likely means.
  const byKey = new Map<string, { rank: number; name: string; listeners: number }>();
  for (const r of rows) {
    const k = nameKey(r.name);
    if (!k) continue;
    const prev = byKey.get(k);
    if (!prev || r.listeners > prev.listeners) byKey.set(k, r);
  }
  // A partial snapshot is still better than none, but it is dated stale so
  // the next boot tries for the whole thing again.
  const now = complete ? Date.now() : Date.now() - STALE_MS - 1;
  const entries = [...byKey.entries()];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`DELETE FROM "StreamingFigure"`);
    for (let i = 0; i < entries.length; i += 500) {
      const values = entries
        .slice(i, i + 500)
        .map(([k, r]) => `('${k}','${r.name.replace(/'/g, "''")}',${r.listeners},${r.rank},${now})`)
        .join(",");
      await tx.$executeRawUnsafe(
        `INSERT INTO "StreamingFigure" ("key","name","listeners","rank","capturedAt") VALUES ${values}`,
      );
    }
  }, { timeout: 120_000 });
  console.log(`[listeners] snapshot ${complete ? "refreshed" : "partially refreshed"}: ${entries.length} artists`);
  return entries.length;
}

/** Refresh if there is no snapshot or it is stale. Never throws. */
export async function ensureListenerSnapshot(): Promise<void> {
  try {
    const latest = (await prisma.$queryRawUnsafe(
      `SELECT MAX("capturedAt") AS t, COUNT(*) AS n FROM "StreamingFigure"`,
    )) as { t: number | null; n: number | bigint }[];
    const n = Number(latest[0]?.n ?? 0);
    const t = Number(latest[0]?.t ?? 0);
    if (n > 0 && Date.now() - t < STALE_MS) return;
    await refreshListenerSnapshot();
  } catch (e) {
    console.error("[listeners] refresh failed", e);
  }
}

/**
 * The figures to size listings from. Stored snapshot first; the static
 * figures shipped with the roster fill in for the largest names if the
 * snapshot has not been fetched yet.
 */
export type FigureIndex = {
  /** True when a full snapshot exists, so absence means "below the threshold". */
  populated: boolean;
  capturedAt: number | null;
  get(name: string): number | null;
};

const STATIC: ReadonlyMap<string, number> = new Map<string, number>([
  ...Object.entries(LISTENERS_BASE).map(([k, v]) => [nameKey(k), v] as [string, number]),
  ...ROSTER_EXPANSION.filter((e) => e.listeners).map((e) => [nameKey(e.name), e.listeners!] as [string, number]),
]);

export async function loadFigureIndex(): Promise<FigureIndex> {
  let stored = new Map<string, number>();
  let capturedAt: number | null = null;
  try {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT "key", "listeners", "capturedAt" FROM "StreamingFigure"`,
    )) as { key: string; listeners: number; capturedAt: number }[];
    stored = new Map(rows.map((r) => [r.key, Number(r.listeners)]));
    if (rows.length) capturedAt = Number(rows[0].capturedAt);
  } catch (e) {
    console.error("[listeners] could not read snapshot", e);
  }
  const populated = stored.size >= 1000;
  return {
    populated,
    capturedAt,
    get(name) {
      const k = nameKey(name);
      const v = stored.get(k) ?? STATIC.get(k);
      return typeof v === "number" && v > 0 ? v : null;
    },
  };
}

/**
 * The audience a listing opens at. A published figure where there is one;
 * where the snapshot is complete and the artist is absent, a draw from below
 * the publication threshold, because that is what absence means; and no
 * anchor at all when there is no snapshot to consult.
 */
export function anchorFor(index: FigureIndex, name: string, r: RNG): number | null {
  const figure = index.get(name);
  if (figure !== null) return figure;
  if (!index.populated) return null;
  const lo = Math.log(60_000);
  const hi = Math.log(PUBLIC_THRESHOLD * 0.96);
  return Math.round(Math.exp(r.uniform(lo, hi)));
}
