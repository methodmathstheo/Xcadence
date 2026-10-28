/**
 * Rebuild src/lib/sim/roster-data.ts from the harvested artist lists and the
 * partial public listener snapshot in data/roster/.
 *
 *   npx tsx scripts/build-roster.ts
 *
 * Inputs (tab-separated, no header):
 *   data/roster/rap_*.txt, rnb.txt, house.txt   name, wiki title, country, subgenre
 *   data/roster/kworb_*.tsv                      rank, artist, monthly listeners
 *
 * Names already in the hand-written roster (src/lib/sim/names.ts) are not
 * repeated; their listener figures go to LISTENERS_BASE instead. Everything
 * else becomes ROSTER_EXPANSION, in file order, so re-running after adding a
 * list appends rather than reshuffles.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nameKey } from "../src/lib/music/name-key";
import { ROSTER_BASE } from "../src/lib/sim/names";

const DIR = join(process.cwd(), "data", "roster");
const OUT = join(process.cwd(), "src", "lib", "sim", "roster-data.ts");
const SNAPSHOT = process.env.SNAPSHOT_DATE ?? new Date().toISOString().slice(0, 10);

type Entry = { name: string; chart: "rap" | "rnb" | "house"; wiki?: string; country?: string; genre?: string; listeners?: number };

const files = readdirSync(DIR).sort();
const listeners = new Map<string, number>();
for (const f of files.filter((f) => f.startsWith("kworb_") && f.endsWith(".tsv"))) {
  for (const line of readFileSync(join(DIR, f), "utf8").split("\n")) {
    const [, name, n] = line.split("\t");
    if (!name || !n) continue;
    const k = nameKey(name);
    const v = Number(n);
    if (!k || !Number.isFinite(v) || v <= 0) continue;
    if ((listeners.get(k) ?? 0) < v) listeners.set(k, v);
  }
}

const base = new Map((ROSTER_BASE as readonly string[]).map((n) => [nameKey(n), n]));
const seen = new Set<string>(base.keys());
const entries: Entry[] = [];
let dropped = 0;
for (const f of files.filter((f) => f.endsWith(".txt") && !f.startsWith("_"))) {
  const chart: Entry["chart"] = f.startsWith("rap") ? "rap" : f.startsWith("rnb") ? "rnb" : "house";
  for (const raw of readFileSync(join(DIR, f), "utf8").split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) continue;
    const [name0, wiki0, country0, genre0] = line.split("\t").map((s) => (s ?? "").trim());
    const name = name0.replace(/\s+/g, " ");
    if (!name || name.length > 60) { dropped++; continue; }
    const k = nameKey(name);
    if (!k || seen.has(k)) { dropped++; continue; }
    seen.add(k);
    const e: Entry = { name, chart };
    if (wiki0 && wiki0 !== name) e.wiki = wiki0;
    if (/^[A-Z]{2}$/.test(country0)) e.country = country0;
    if (genre0) e.genre = genre0.toLowerCase();
    const l = listeners.get(k);
    if (l) e.listeners = l;
    entries.push(e);
  }
}

const baseListeners: Record<string, number> = {};
for (const [k, name] of base) {
  const l = listeners.get(k);
  if (l) baseListeners[name] = l;
}

const q = (s: string) => JSON.stringify(s);
const lines = entries.map((e) => {
  const parts = [`name: ${q(e.name)}`, `chart: ${q(e.chart)}`];
  if (e.wiki) parts.push(`wiki: ${q(e.wiki)}`);
  if (e.country) parts.push(`country: ${q(e.country)}`);
  if (e.genre) parts.push(`genre: ${q(e.genre)}`);
  if (e.listeners) parts.push(`listeners: ${e.listeners}`);
  return `  { ${parts.join(", ")} },`;
});

const out = `/**
 * GENERATED — do not edit by hand. Rebuilt by scripts/build-roster.ts from
 * the harvested artist lists and the public monthly-listener snapshot in
 * data/roster/.
 */
export type Chart = "rap" | "rnb" | "house";

export type RosterEntry = {
  name: string;
  chart: Chart;
  /** Wikipedia article title, only where it differs from the name. */
  wiki?: string;
  /** ISO 3166 country code, where known. */
  country?: string;
  /** Curated subgenre, shown where no source has tagged the artist. */
  genre?: string;
  /** Spotify monthly listeners at the snapshot date, where the partial snapshot has them. */
  listeners?: number;
};

/** Date of the public monthly-listener snapshot the sizes are anchored to. */
export const LISTENERS_SNAPSHOT = ${q(SNAPSHOT)};

/** Artists added on top of the hand-written roster, in listing order. */
export const ROSTER_EXPANSION: readonly RosterEntry[] = [
${lines.join("\n")}
];

/** Monthly listeners for the hand-written roster, where the snapshot has them. */
export const LISTENERS_BASE: Readonly<Record<string, number>> = ${JSON.stringify(baseListeners, null, 2)};
`;
writeFileSync(OUT, out);
const byChart = entries.reduce((m, e) => m.set(e.chart, (m.get(e.chart) ?? 0) + 1), new Map<string, number>());
console.log(`wrote ${entries.length} expansion entries (${[...byChart].map(([c, n]) => `${c} ${n}`).join(", ")}), ${entries.filter((e) => e.listeners).length} with listener figures, ${Object.keys(baseListeners).length} base figures, ${dropped} duplicates/invalid dropped`);
