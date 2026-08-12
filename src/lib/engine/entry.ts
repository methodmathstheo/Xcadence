import { RNG } from "@/lib/rng";
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
export function spawnArtists(w: World, rng: RNG, tMs: number): void {
  let active = 0;
  for (const id of w.order) if (w.artists.get(id)!.active) active++;
  // Debuts queued earlier in this same jump have not been flushed into the
  // world yet. Counting them is what stops a multi-year fast-forward from
  // filling the same shortfall once per simulated month.
  active += w.pending.newArtists.length;

  const shortfall = TARGET_ACTIVE - active;
  // Replace part of the gap each month plus a low baseline of new signings, so
  // the count drifts back to target instead of snapping to it.
  const expected = Math.max(0, shortfall * 0.22) + 1.4;
  const n = poisson(rng, expected);
  if (n <= 0) return;

  const existing = new Set<string>();
  for (const id of w.order) existing.add(w.artists.get(id)!.name);

  const candidates = generateNames(rng.fork("names", tMs), n * 4);
  const chosen = candidates.filter((c) => !existing.has(c)).slice(0, n);

  for (let i = 0; i < chosen.length; i++) {
    const r = rng.fork("entrant", tMs, i);

    // Entrants are drawn from the same quality law as the original universe.
    // A debut carries no information: the good ones are not identifiable yet,
    // which is exactly what makes the primary market hard.
    const trueQuality = Math.min(0.98, Math.max(0.02, Math.pow(r.next(), 3.0) * 1.05));
    const hazardRate = Math.max(
      0.0004,
      0.019 * Math.exp(-3.4 * trueQuality) * r.uniform(0.7, 1.4),
    );
    const driftMu = -0.011 + 0.05 * trueQuality + r.normal(0, 0.006);
    const sigma = 0.055 + 0.2 * (1 - trueQuality) + r.uniform(0, 0.05);
    const breakoutP = 0.0025 + 0.012 * trueQuality;
    const royaltyRate = r.uniform(0.0028, 0.0062);

    // Debuts start well below their eventual level — nobody arrives finished.
    const listeners = Math.max(
      150,
      targetListeners({ trueQuality }) * Math.exp(r.normal(-1.8, 0.85)),
    );

    const draft: Omit<ArtistState, "id"> = {
      name: chosen[i],
      genre: r.pick(GENRES),
      tier: classifyTier(listeners),
      debutTier: classifyTier(listeners),
      debutMs: tMs,
      active: true,
      exitMs: null,
      exitReason: null,
      trueQuality,
      hazardRate,
      driftMu,
      sigma,
      breakoutP,
      listeners,
      listeners30: listeners,
      listeners90: listeners,
      volatility: sigma * Math.sqrt(12),
      royaltyRate,
      unitScale: 10_000,
      q: 0,
      b: 1,
      vMax: 1,
      price: 0,
      prevPrice: 0,
      logReturns: [],
      listenerTrail: [listeners],
      dirty: false,
    };

    const pv = dcf(estimateInputs(draft)).pv;
    const openTarget = r.uniform(CONTRACT_PRICE_BAND.lo, CONTRACT_PRICE_BAND.hi);
    draft.unitScale = Math.max(1, pv / openTarget);
    const price = Math.max(0.01, (pv / draft.unitScale) * Math.exp(r.normal(0, 0.22)));
    draft.b = Math.max(500, (TIER_DEPTH[draft.tier as Tier] ?? TIER_DEPTH.emerging) / price);
    draft.vMax = price * 8;
    draft.q = qForPrice(price, draft.b, draft.vMax);
    draft.price = price;
    draft.prevPrice = price;

    w.pending.newArtists.push(draft);
    w.pending.events.push({
      artistId: null,
      kind: "debut",
      magnitude: 0,
      headline: `${draft.name} — debut listing, ${draft.genre}`,
      tMs,
    });
  }
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
