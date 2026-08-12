/**
 * Logarithmic Market Scoring Rule market maker (Hanson 2003), in its
 * two-outcome / complementary-claim form, one market per artist.
 *
 *   price(q)  = vMax · σ(q / b)              σ = logistic
 *   cost C(q) = vMax · b · ln(1 + e^(q/b))
 *   spend to move q → q+Δ  =  C(q+Δ) − C(q)
 *
 * Properties we actually rely on:
 *  - Always quotes. No counterparty needed, so the market never goes empty.
 *  - Bounded loss for the market maker: vMax · b · ln 2.
 *  - Price strictly in (0, vMax), monotone in q, so impact and slippage are
 *    well defined and computable *before* the trade.
 *  - b is the only liquidity knob: larger b ⇒ flatter book ⇒ less impact.
 *
 * `q` is net contracts held by the market (positive = net long the artist).
 */

/** Numerically stable ln(1 + e^x). */
export function log1pExp(x: number): number {
  if (x > 35) return x;
  if (x < -35) return Math.exp(x);
  return Math.log1p(Math.exp(x));
}

export function logistic(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

export function lmsrPrice(q: number, b: number, vMax: number): number {
  return vMax * logistic(q / b);
}

export function lmsrCost(q: number, b: number, vMax: number): number {
  return vMax * b * log1pExp(q / b);
}

/** Inverse: the q that makes the market quote exactly `price`. */
export function qForPrice(price: number, b: number, vMax: number): number {
  const p = Math.min(Math.max(price, vMax * 1e-6), vMax * (1 - 1e-6));
  return b * Math.log(p / (vMax - p));
}

export interface Quote {
  /** Signed contracts. Positive = buy, negative = sell. */
  qty: number;
  /** Credits leaving the account (negative when selling). */
  cost: number;
  priceBefore: number;
  priceAfter: number;
  /** cost / qty — what you actually paid per contract. */
  avgPrice: number;
  /** priceAfter − priceBefore. How far the trade moved the market. */
  impact: number;
  /** (avgPrice − priceBefore) / priceBefore. What the impact cost you. */
  slippage: number;
  qAfter: number;
}

export function quoteTrade(q: number, b: number, vMax: number, qty: number): Quote {
  const priceBefore = lmsrPrice(q, b, vMax);
  const qAfter = q + qty;
  const priceAfter = lmsrPrice(qAfter, b, vMax);
  const cost = lmsrCost(qAfter, b, vMax) - lmsrCost(q, b, vMax);
  const avgPrice = qty === 0 ? priceBefore : cost / qty;
  return {
    qty,
    cost,
    priceBefore,
    priceAfter,
    avgPrice,
    impact: priceAfter - priceBefore,
    slippage: priceBefore === 0 ? 0 : (avgPrice - priceBefore) / priceBefore,
    qAfter,
  };
}

/**
 * Largest buy affordable with `credits`. C is convex and increasing, so a
 * bisection on qty converges fast and never overshoots the budget.
 */
export function maxBuyForCredits(
  q: number,
  b: number,
  vMax: number,
  credits: number,
): number {
  if (credits <= 0) return 0;
  let lo = 0;
  let hi = b;
  // Expand until unaffordable, capped — cost → vMax·Δ asymptotically.
  while (lmsrCost(q + hi, b, vMax) - lmsrCost(q, b, vMax) < credits && hi < b * 1e4) {
    hi *= 2;
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (lmsrCost(q + mid, b, vMax) - lmsrCost(q, b, vMax) <= credits) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The logistic form caps price at vMax. When fundamentals run away from the
 * original cap we lift it and re-solve q so the quoted price is *unchanged* —
 * headroom appears without a discontinuity in the tape.
 */
export function ensureHeadroom(
  q: number,
  b: number,
  vMax: number,
): { q: number; vMax: number; raised: boolean } {
  const p = lmsrPrice(q, b, vMax);
  if (p < vMax * 0.9) return { q, vMax, raised: false };
  const nextVMax = vMax * 2;
  return { q: qForPrice(p, b, nextVMax), vMax: nextVMax, raised: true };
}

/** Market-maker's worst-case subsidy for this market. */
export function lmsrMaxLoss(b: number, vMax: number): number {
  return b * vMax * Math.LN2;
}
