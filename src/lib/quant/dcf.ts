import {
  CONTRACT_DIVISOR,
  DEFAULT_DISCOUNT,
  DEFAULT_HORIZON_MONTHS,
  TIER_GROWTH_PRIOR,
  TIER_HAZARD_EST,
  type Tier,
} from "@/lib/sim/constants";

/**
 * Discounted cash flow on a royalty stream.
 *
 * The stream is monthly royalty income, growing at a rate that decays toward
 * zero (no artist compounds at 40% forever), multiplied by the probability the
 * artist is still commercially active, then discounted.
 *
 *   CF_m = R₀ · Π(1 + g_k) · (1 − h)^m
 *   PV   = Σ CF_m / (1 + r)^(m/12)
 *
 * Everything here runs on *observable* inputs only. Nothing in this file may
 * read `trueQuality` or the artist's real `hazardRate` — that separation is
 * the whole point of the inspector.
 */

export interface DcfInputs {
  /** Current monthly royalty income in credits. */
  monthlyRoyalty: number;
  /** Estimated annual growth at t=0. */
  growthAnnual: number;
  /** Estimated monthly probability of commercial exit. */
  hazardMonthly: number;
  /** Annual discount rate. */
  discountAnnual: number;
  horizonMonths?: number;
  /** Months for the growth rate to halve. */
  growthHalfLifeMonths?: number;
  /** Contracts the whole claim is divided into. See CONTRACT_PRICE_BAND. */
  unitScale?: number;
}

export interface DcfMonthRow {
  month: number;
  grossRoyalty: number;
  survival: number;
  expected: number;
  discounted: number;
  cumulative: number;
}

export interface DcfResult {
  pv: number;
  /** PV expressed per contract (1 bp of the claim). */
  pvPerContract: number;
  rows: DcfMonthRow[];
  /** PV / trailing 12-month royalty income. */
  impliedMultiple: number;
  annualRoyalty: number;
  /** Share of PV arriving in the first 24 months. */
  frontLoad: number;
  inputs: Required<DcfInputs>;
}

export function dcf(input: DcfInputs): DcfResult {
  const inputs: Required<DcfInputs> = {
    horizonMonths: DEFAULT_HORIZON_MONTHS,
    growthHalfLifeMonths: 30,
    unitScale: CONTRACT_DIVISOR,
    ...input,
  };
  const {
    monthlyRoyalty,
    growthAnnual,
    hazardMonthly,
    discountAnnual,
    horizonMonths,
    growthHalfLifeMonths,
  } = inputs;

  const g0 = Math.pow(1 + Math.max(growthAnnual, -0.95), 1 / 12) - 1;
  const rMonthlyDiscount = Math.pow(1 + discountAnnual, 1 / 12);

  const rows: DcfMonthRow[] = [];
  let gross = monthlyRoyalty;
  let survival = 1;
  let pv = 0;
  let pv24 = 0;

  for (let m = 1; m <= horizonMonths; m++) {
    const g = g0 * Math.pow(0.5, (m - 1) / growthHalfLifeMonths);
    gross = gross * (1 + g);
    survival = survival * (1 - hazardMonthly);
    const expected = gross * survival;
    const discounted = expected / Math.pow(rMonthlyDiscount, m);
    pv += discounted;
    if (m <= 24) pv24 += discounted;
    rows.push({
      month: m,
      grossRoyalty: gross,
      survival,
      expected,
      discounted,
      cumulative: pv,
    });
  }

  const annualRoyalty = monthlyRoyalty * 12;
  return {
    pv,
    pvPerContract: pv / inputs.unitScale,
    rows,
    impliedMultiple: annualRoyalty > 0 ? pv / annualRoyalty : 0,
    annualRoyalty,
    frontLoad: pv > 0 ? pv24 / pv : 0,
    inputs,
  };
}

export interface SensitivityPoint {
  rate: number;
  pv: number;
  pvPerContract: number;
}

/** PV across a sweep of discount rates, plus the rate at which PV halves. */
export function discountSensitivity(
  input: DcfInputs,
  lo = 0.05,
  hi = 0.3,
  steps = 51,
): { curve: SensitivityPoint[]; baseline: number; halvingRate: number | null } {
  const curve: SensitivityPoint[] = [];
  for (let i = 0; i < steps; i++) {
    const rate = lo + ((hi - lo) * i) / (steps - 1);
    const r = dcf({ ...input, discountAnnual: rate });
    curve.push({ rate, pv: r.pv, pvPerContract: r.pvPerContract });
  }
  const baseline = dcf({ ...input, discountAnnual: lo }).pv;
  const target = baseline / 2;

  let halvingRate: number | null = null;
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].pv <= target && curve[i - 1].pv > target) {
      const a = curve[i - 1];
      const b = curve[i];
      const t = (a.pv - target) / (a.pv - b.pv);
      halvingRate = a.rate + t * (b.rate - a.rate);
      break;
    }
  }
  return { curve, baseline, halvingRate };
}

/**
 * Turn the public snapshot of an artist into DCF inputs. Observed 90-day
 * growth is noisy on a small base, so it is shrunk toward the tier prior —
 * roughly what a careful analyst with only public data would do.
 */
export function estimateInputs(a: {
  tier: string;
  listeners: number;
  listeners90: number;
  royaltyRate: number;
  volatility: number;
  unitScale?: number;
}, discountAnnual = DEFAULT_DISCOUNT): DcfInputs {
  const tier = a.tier as Tier;
  const observedQuarterly =
    a.listeners90 > 0 ? a.listeners / a.listeners90 - 1 : 0;
  const observedAnnual = Math.pow(1 + clamp(observedQuarterly, -0.5, 1), 4) - 1;
  const prior = TIER_GROWTH_PRIOR[tier] ?? 0.1;

  // Shrinkage weight falls as realised vol rises: noisier signal, trust it less.
  const w = clamp(1 / (1 + 8 * a.volatility), 0.15, 0.75);

  // Hard bounds on the annual rate. Compounding a quarter's move to the fourth
  // power is violently unstable on emerging names — left unbounded it produced
  // fair values that moved by multiples month to month, which is not a
  // valuation any analyst would publish and not an anchor any market could
  // track. No projection here runs above 120% or below -50% a year.
  const growthAnnual = clamp(w * observedAnnual + (1 - w) * prior, -0.5, 1.2);

  return {
    monthlyRoyalty: a.listeners * a.royaltyRate,
    growthAnnual,
    hazardMonthly: TIER_HAZARD_EST[tier] ?? 0.01,
    discountAnnual,
    unitScale: a.unitScale ?? CONTRACT_DIVISOR,
  };
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}
