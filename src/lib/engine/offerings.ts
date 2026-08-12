import type { RNG } from "@/lib/rng";
import type { World } from "@/lib/engine/types";

/**
 * Primary-market machinery, called once per simulated month from the tick
 * engine. Implemented in stage 6; the call sites are wired now so month
 * rollover does not need to change later.
 */

/** Pay one month of royalties into every open offering position. */
export function accrueRoyalties(_w: World, _monthKey: number, _tMs: number): void {
  // stage 6
}

/** Expire stale offerings, fill them with synthetic demand, list new ones. */
export function refreshOfferings(_w: World, _rng: RNG, _tMs: number): void {
  // stage 6
}
