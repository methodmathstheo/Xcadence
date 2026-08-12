import type { RNG } from "@/lib/rng";
import type { World } from "@/lib/engine/types";

/**
 * Synthetic order flow. Implemented in stage 4 alongside the AMM plumbing —
 * until then the clock advances fundamentals but nothing pushes `q`, so quotes
 * hold still. The seam exists now so the engine's tick loop is final.
 */
export function runOrderFlow(_w: World, _rng: RNG): void {
  // stage 4
}
