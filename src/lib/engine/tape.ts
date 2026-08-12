import { classifyTier } from "@/lib/sim/constants";
import type { TapeEntry, World } from "@/lib/engine/types";

/**
 * Tape writers live here rather than in engine.ts so that trading.ts can
 * append prints without importing the engine module — engine imports bots,
 * bots import trading, and closing that loop back onto engine would leave the
 * singleton half-initialised at module load.
 */

const TAPE_MAX = 300;

export function pushTape(w: World, entry: TapeEntry) {
  w.tape.unshift(entry);
  if (w.tape.length > TAPE_MAX) w.tape.length = TAPE_MAX;
}

export function pushEvent(
  w: World,
  e: { artistId: number | null; kind: string; magnitude: number; headline: string },
) {
  w.pending.events.push({ ...e, tMs: w.simMs });
  const a = e.artistId ? w.artists.get(e.artistId) : null;
  pushTape(w, {
    id: `e${w.tick}-${w.pending.events.length}-${e.artistId ?? 0}`,
    kind: "event",
    tMs: w.simMs,
    artistId: e.artistId,
    artistName: a?.name ?? "—",
    text: e.headline,
    eventKind: e.kind,
    magnitude: e.magnitude,
  });
  if (e.kind === "exit" && a) a.tier = classifyTier(a.listeners);
}
