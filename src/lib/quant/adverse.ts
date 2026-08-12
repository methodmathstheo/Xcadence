import { RNG } from "@/lib/rng";
import { dcf, estimateInputs } from "@/lib/quant/dcf";
import type { ArtistState } from "@/lib/sim/dynamics";

/**
 * Adverse selection in the primary market.
 *
 * This is one of only three places allowed to read hidden parameters, and it
 * has to be: the whole mechanism depends on the seller knowing something the
 * buyer does not. An artist's own valuation is built from their real hazard
 * and real drift; the market's is built from the tier-inferred estimate every
 * other surface uses.
 *
 * An artist sells when the offer clears what they privately believe the stream
 * is worth. Raise the price and you buy more streams, but you also buy them
 * from people increasingly happy to sell — so average quality falls as volume
 * rises. Price off the average of who accepted and the good ones leave, which
 * lowers the average again. That is the unravelling.
 */

export interface AdverseInputs {
  /** 0 = artist knows no more than the market, 1 = artist knows the truth. */
  informationAdvantage: number;
  /** Offer as a multiple of the market's naive valuation. */
  offerPrice: number;
  rounds: number;
  seed: number;
}

export interface PoolPoint {
  price: number;
  accepted: number;
  acceptRate: number;
  /** Mean hidden quality of the artists who accepted. */
  poolQuality: number;
  /** Mean hidden quality of everyone. */
  baselineQuality: number;
  /** What the buyer pays per unit of true value acquired. Above 1 is a loss. */
  priceToValue: number;
  buyerSurplus: number;
}

export interface UnravelStep {
  round: number;
  price: number;
  accepted: number;
  poolQuality: number;
  priceToValue: number;
}

export interface AdverseResult {
  universe: number;
  baselineQuality: number;
  current: PoolPoint;
  /** Pool quality and size across a sweep of offer prices. */
  sweep: PoolPoint[];
  /** Iterating "price at the accepting pool's average value". */
  unravelling: UnravelStep[];
  collapsed: boolean;
}

interface Valued {
  quality: number;
  publicValue: number;
  trueValue: number;
  privateValue: number;
}

export function adverseSelection(
  artists: ArtistState[],
  input: AdverseInputs,
): AdverseResult {
  const rng = new RNG(input.seed);
  const adv = Math.min(1, Math.max(0, input.informationAdvantage));

  const valued: Valued[] = [];
  for (const a of artists) {
    const naive = dcf(estimateInputs(a)).pv;
    if (!(naive > 0)) continue;

    // Truth: the artist's real hazard and real drift, not the tier estimate.
    const trueValue = dcf({
      monthlyRoyalty: a.listeners * a.royaltyRate,
      growthAnnual: Math.exp(a.driftMu * 12) - 1,
      hazardMonthly: a.hazardRate,
      discountAnnual: 0.14,
    }).pv;

    // The artist's belief interpolates between the two in log space, plus a
    // little private noise — nobody knows their own future exactly either.
    const blend =
      Math.pow(Math.max(trueValue, 1e-9), adv) * Math.pow(naive, 1 - adv);
    const privateValue = blend * Math.exp(rng.fork(a.id).normal(0, 0.12 * (1 - adv) + 0.05));

    valued.push({ quality: a.trueQuality, publicValue: naive, trueValue, privateValue });
  }

  const baselineQuality = mean(valued.map((v) => v.quality));

  const evaluate = (multiple: number): PoolPoint => {
    let accepted = 0;
    let qSum = 0;
    let paid = 0;
    let got = 0;
    for (const v of valued) {
      const offer = multiple * v.publicValue;
      // Sell if the offer beats what you privately think it is worth.
      if (offer >= v.privateValue) {
        accepted++;
        qSum += v.quality;
        paid += offer;
        got += v.trueValue;
      }
    }
    return {
      price: multiple,
      accepted,
      acceptRate: valued.length ? accepted / valued.length : 0,
      poolQuality: accepted ? qSum / accepted : 0,
      baselineQuality,
      priceToValue: got > 0 ? paid / got : 0,
      buyerSurplus: got - paid,
    };
  };

  const sweep: PoolPoint[] = [];
  for (let i = 0; i <= 40; i++) {
    sweep.push(evaluate(0.1 + (i * (2.5 - 0.1)) / 40));
  }

  // Unravelling: the buyer keeps repricing at the average true value of
  // whoever accepted last round, expressed as a multiple of naive value.
  const unravelling: UnravelStep[] = [];
  let multiple = input.offerPrice;
  let collapsed = false;
  for (let round = 1; round <= input.rounds; round++) {
    const point = evaluate(multiple);
    unravelling.push({
      round,
      price: multiple,
      accepted: point.accepted,
      poolQuality: point.poolQuality,
      priceToValue: point.priceToValue,
    });
    if (point.accepted === 0) {
      collapsed = true;
      break;
    }
    let trueSum = 0;
    let pubSum = 0;
    for (const v of valued) {
      if (multiple * v.publicValue >= v.privateValue) {
        trueSum += v.trueValue;
        pubSum += v.publicValue;
      }
    }
    const next = pubSum > 0 ? trueSum / pubSum : 0;
    if (Math.abs(next - multiple) < 1e-4) break;
    multiple = next;
  }

  return {
    universe: valued.length,
    baselineQuality,
    current: evaluate(input.offerPrice),
    sweep,
    unravelling,
    collapsed,
  };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
