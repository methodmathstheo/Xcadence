import { RNG } from "@/lib/rng";
import { monthKey, monthKeyToMs } from "@/lib/sim/time";

/**
 * Release history for *generated* artists only.
 *
 * These artists are invented, so inventing their catalogue is coherent. Real
 * roster names never come through here — a fabricated discography attached to
 * a real person reads as a factual claim in a way a simulated price does not,
 * and there is no version of that which is acceptable to ship. Their releases
 * come from Spotify or they show nothing.
 *
 * Deterministic in (seed, artistId), so a release list is stable across
 * reloads and reproduces from the run seed like everything else.
 */

const ADJ = [
  "Velvet", "Hollow", "Paper", "Glass", "Neon", "Quiet", "Bitter", "Golden",
  "Static", "Lunar", "Crimson", "Iron", "Soft", "Wild", "Pale", "Slow",
  "Midnight", "Cobalt", "Feral", "Marble", "Salt", "Amber", "Hazy", "Copper",
];
const NOUN = [
  "Harbour", "Signal", "Cathedral", "Motel", "Orchard", "Ledger", "Antenna",
  "Chapel", "Tundra", "Corridor", "Lantern", "Furnace", "Meridian", "Basin",
  "Cassette", "Terrace", "Quarry", "Almanac", "Beacon", "Riptide", "Prism",
];
const ABSTRACT = [
  "Nothing Keeps", "Long Way Down", "After the Fact", "Room Tone", "Half Light",
  "No Fixed Address", "Second Language", "Open Water", "Small Hours",
  "Everything Louder", "Tell Me Twice", "Weather Permitting", "Low Ceiling",
  "Nobody's Business", "Hold Steady", "Cut the Cord", "Dead Air",
];

export interface Release {
  title: string;
  type: "album" | "EP" | "single";
  monthKey: number;
  dateMs: number;
  /** Monthly listeners in the release month, where history covers it. */
  listenersAtRelease: number | null;
  /** A market event in the same month, if one landed. */
  note: string | null;
}

function title(rng: RNG): string {
  const shape = rng.int(0, 3);
  if (shape === 0) return `${rng.pick(ADJ)} ${rng.pick(NOUN)}`;
  if (shape === 1) return rng.pick(ABSTRACT);
  if (shape === 2) return rng.pick(NOUN).toUpperCase();
  return `${rng.pick(ADJ)} ${rng.pick(ADJ)} ${rng.pick(NOUN)}`;
}

export function generateReleases(
  seed: number,
  artistId: number,
  debutMs: number,
  untilMs: number,
  history: { monthKey: number; listeners: number }[],
  events: { tMs: number; kind: string; headline: string }[],
): Release[] {
  const rng = new RNG(`${seed}:releases:${artistId}`);
  const listenersBy = new Map(history.map((h) => [h.monthKey, h.listeners]));
  const eventBy = new Map<number, string>();
  for (const e of events) {
    // Releases are what the tape reacts to, so pair them where the months line
    // up. It is presentation, not causation — the engine has no release model.
    if (["breakout", "viral", "playlist", "sync"].includes(e.kind)) {
      eventBy.set(monthKey(e.tMs), e.headline);
    }
  }

  const out: Release[] = [];
  const startKey = monthKey(debutMs);
  const endKey = monthKey(untilMs);

  // Debut release, then a rolling cadence: singles between longer projects.
  let k = startKey + rng.int(0, 2);
  let sinceAlbum = 0;

  while (k <= endKey && out.length < 40) {
    const isAlbum = sinceAlbum >= rng.int(3, 6);
    const type: Release["type"] = isAlbum
      ? "album"
      : rng.bool(0.25)
        ? "EP"
        : "single";
    if (isAlbum) sinceAlbum = 0;
    else sinceAlbum++;

    out.push({
      title: title(rng),
      type,
      monthKey: k,
      dateMs: monthKeyToMs(k),
      listenersAtRelease: listenersBy.get(k) ?? null,
      note: eventBy.get(k) ?? null,
    });

    // Albums are followed by a longer quiet period than singles.
    k += type === "album" ? rng.int(8, 20) : rng.int(3, 9);
  }

  return out.reverse();
}
