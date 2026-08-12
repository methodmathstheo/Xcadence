import { RNG } from "@/lib/rng";
import { classifyTier, type Tier } from "@/lib/sim/constants";

/**
 * The artist process. History seeding and the live tick engine both call these
 * functions, so backfilled months and forward-generated months come out of
 * exactly the same generator — no regime break at "today".
 *
 * Monthly log-growth is:
 *
 *   Δlog L = μ  +  κ·(log L* − log L)/12  +  σ·Z  +  1{breakout}·log(Pareto)
 *
 * The Pareto term is what makes the cross-section heavy-tailed and right
 * skewed. Returns are emphatically not normal: mean ≫ median by construction,
 * and a small number of artists carry the whole cohort.
 */

export interface ArtistState {
  id: number;
  name: string;
  genre: string;
  tier: Tier;
  /** Tier at listing; never changes. */
  debutTier: Tier;
  debutMs: number;
  active: boolean;
  exitMs: number | null;
  exitReason: string | null;

  // hidden ground truth
  trueQuality: number;
  hazardRate: number;
  driftMu: number;
  sigma: number;
  breakoutP: number;

  // observable fundamentals
  listeners: number;
  listeners30: number;
  listeners90: number;
  volatility: number;
  royaltyRate: number;

  // market
  unitScale: number;
  q: number;
  b: number;
  vMax: number;
  price: number;
  prevPrice: number;

  // in-memory only
  logReturns: number[];
  listenerTrail: number[]; // daily trailing listeners, newest last, cap 120
  dirty: boolean;
}

export interface SimEvent {
  artistId: number | null;
  kind: string;
  magnitude: number;
  headline: string;
}

/**
 * Reversion is asymmetric. Falling below your quality level is easy to undo;
 * holding an audience far above it is not. Without the asymmetry the Pareto
 * jumps stack multiplicatively and the top of the universe runs away to
 * listener counts no real artist has ever had.
 */
const KAPPA_BELOW = 0.35;
const KAPPA_ABOVE = 2.0;

const MIN_LISTENERS = 120;
/** Nothing in the universe may exceed this; the largest real artists sit ~1e8. */
const MAX_LISTENERS = 160_000_000;

/** Long-run listener level implied by hidden quality. */
export function targetListeners(a: Pick<ArtistState, "trueQuality">): number {
  // quality 0 → ~22k, quality 1 → ~20M, log-linear between.
  return Math.exp(10.0 + 6.8 * a.trueQuality);
}

function reversionPull(listeners: number, target: number): number {
  const gap = Math.log(target) - Math.log(listeners);
  const kappa = gap < 0 ? KAPPA_ABOVE : KAPPA_BELOW;
  return (kappa * gap) / 12;
}

/**
 * Advance fundamentals by `days` of simulated time. Drift and variance scale
 * linearly in time, so 30 one-day steps and one 30-day step agree in law.
 */
export function advanceDays(a: ArtistState, rng: RNG, days: number): void {
  if (!a.active || days <= 0) return;
  const f = days / 30;
  const pull = reversionPull(a.listeners, targetListeners(a));
  const g = (a.driftMu + pull) * f + a.sigma * Math.sqrt(f) * rng.normal();
  a.listeners = clampListeners(a.listeners * Math.exp(g));

  a.listenerTrail.push(a.listeners);
  if (a.listenerTrail.length > 120) a.listenerTrail.shift();
  const n = a.listenerTrail.length;
  a.listeners30 = a.listenerTrail[Math.max(0, n - 31)];
  a.listeners90 = a.listenerTrail[Math.max(0, n - 91)];
  a.dirty = true;
}

/**
 * Month boundary: discrete jumps, exit check, tier reclassification.
 * Returns events to be written to the tape.
 */
export function monthBoundary(a: ArtistState, rng: RNG, tMs: number): SimEvent[] {
  const events: SimEvent[] = [];
  if (!a.active) return events;

  const before = a.listeners;

  // --- Exogenous shocks -----------------------------------------------
  // Chance scales mildly with quality: better artists get luckier, but luck
  // is never the whole story and never fully predictable from the outside.
  const qf = 0.5 + a.trueQuality;

  if (rng.bool(0.0045 * qf)) {
    const mult = 1 + rng.uniform(0.12, 0.55);
    a.listeners *= mult;
    events.push({
      artistId: a.id,
      kind: "sync",
      magnitude: mult - 1,
      headline: `${a.name} — sync placement, +${pct(mult - 1)} listeners`,
    });
  }

  if (rng.bool(0.012 * qf)) {
    const mult = 1 + rng.uniform(0.08, 0.4);
    a.listeners *= mult;
    a.driftMu += 0.004;
    events.push({
      artistId: a.id,
      kind: "playlist",
      magnitude: mult - 1,
      headline: `${a.name} — editorial playlist add, +${pct(mult - 1)}`,
    });
  }

  if (rng.bool(0.0035 * qf)) {
    const mult = 1 + Math.min(4, rng.pareto(1.5, 0.6));
    a.listeners *= mult;
    events.push({
      artistId: a.id,
      kind: "viral",
      magnitude: mult - 1,
      headline: `${a.name} — viral moment, ×${mult.toFixed(2)} listeners`,
    });
  }

  if (rng.bool(0.005 / qf)) {
    const mult = 1 - rng.uniform(0.15, 0.45);
    a.listeners *= mult;
    a.driftMu -= 0.006;
    a.hazardRate *= 1.35;
    events.push({
      artistId: a.id,
      kind: "labeldrop",
      magnitude: mult - 1,
      headline: `${a.name} — dropped by label, ${pct(mult - 1)}`,
    });
  }

  // --- Breakout: the power-law tail -----------------------------------
  // The cap binds on well under 1% of draws — it exists to keep the universe
  // physically plausible, not to trim the skew the whole app is about.
  if (rng.bool(a.breakoutP)) {
    const jump = Math.min(9, rng.pareto(1.35, 1.3));
    a.listeners *= jump;
    a.driftMu += 0.006;
    a.hazardRate *= 0.7;
    events.push({
      artistId: a.id,
      kind: "breakout",
      magnitude: jump - 1,
      headline: `${a.name} — breakout, ×${jump.toFixed(2)} listeners`,
    });
  }

  a.listeners = clampListeners(a.listeners);

  // --- Exit ------------------------------------------------------------
  // Hazard is modulated by recent trajectory: sustained decline kills faster.
  const trend = a.listeners90 > 0 ? a.listeners / a.listeners90 : 1;
  const hazard = Math.min(
    0.5,
    a.hazardRate * (trend < 0.8 ? 2.2 : trend < 1 ? 1.3 : 0.75),
  );
  if (rng.bool(hazard)) {
    a.active = false;
    a.exitMs = tMs;
    a.exitReason = trend < 0.8 ? "faded out" : "ceased releasing";
    events.push({
      artistId: a.id,
      kind: "exit",
      magnitude: -1,
      headline: `${a.name} — no longer commercially active (${a.exitReason})`,
    });
  }

  // --- Bookkeeping ------------------------------------------------------
  const r = Math.log(a.listeners / Math.max(before, 1));
  a.logReturns.push(r);
  if (a.logReturns.length > 24) a.logReturns.shift();
  a.volatility = annualisedVol(a.logReturns);
  a.tier = classifyTier(a.listeners);
  a.dirty = true;

  return events;
}

/**
 * Industry-wide monthly shock, applied to every listed artist at once.
 *
 * Without a common factor the artists in this universe are statistically
 * independent, every pairwise correlation sits at zero, and the
 * diversification tool shows portfolio variance falling all the way to nothing
 * — which is not what diversification does and not what a streaming market
 * looks like. Playlist economics, payout rates and seasonal listening move
 * everyone together.
 */
export const MARKET_SHOCK_SD = 0.06;

export function applyMarketShock(a: ArtistState, shock: number): void {
  if (!a.active) return;
  a.listeners = clampListeners(a.listeners * Math.exp(shock));
}

export function clampListeners(x: number): number {
  return Math.min(MAX_LISTENERS, Math.max(MIN_LISTENERS, x));
}

export function annualisedVol(logReturns: number[]): number {
  if (logReturns.length < 2) return 0.25;
  const mean = logReturns.reduce((x, y) => x + y, 0) / logReturns.length;
  const varr =
    logReturns.reduce((x, y) => x + (y - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(varr) * Math.sqrt(12);
}

export function monthlyRoyalty(a: Pick<ArtistState, "listeners" | "royaltyRate">): number {
  return a.listeners * a.royaltyRate;
}

function pct(x: number): string {
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(0)}%`;
}
