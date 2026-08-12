import type { RNG } from "@/lib/rng";
import { generateNames, GENRES } from "@/lib/sim/names";
import { targetListeners, type ArtistState } from "@/lib/sim/dynamics";
import { qForPrice } from "@/lib/sim/lmsr";
import { classifyTier, CONTRACT_PRICE_BAND, TIER_DEPTH, type Tier } from "@/lib/sim/constants";
import { dcf, estimateInputs } from "@/lib/quant/dcf";
import type { World } from "@/lib/engine/types";

/** Active artists the venue tries to keep listed. */
export const TARGET_ACTIVE = 400;

/**
 * New artists debut every simulated month.
 *
 * Without entry the universe is a closed cohort that only ever shrinks: at
 * 43200× the hazard rate empties it inside an hour of wall time, and every
 * survival and cohort statistic slowly becomes a measurement of depletion
 * rather than of the process. Entrants entering at the bottom also keep the
 * emerging tier populated, which is the tier the whole venue trades.
 */
export function spawnArtists(_w: World, _rng: RNG, _tMs: number): void {
  // Disabled. Every listing is a real artist, and the only way to add one
  // would be to invent a name — which is exactly what this venue no longer
  // does. The universe is therefore a closed cohort that can only shrink.
  //
  // Consequence, stated plainly because it costs something real: with no
  // entry, a long fast-forward slowly empties the exchange, and the survival
  // and survivorship tools lose their supply of fresh cohorts. Hazard rates
  // are set low for an all-established roster, so the drain is slow, but it
  // does not stop.
}

/** Knuth's method. Counts are small, so the loop is cheap. */
function poisson(rng: RNG, lambda: number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L);
  return k - 1;
}
