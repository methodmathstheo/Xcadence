import { lmsrCost, lmsrPrice, qForPrice } from "@/lib/sim/lmsr";

/**
 * A depth ladder derived from the LMSR cost function.
 *
 * There is no order book in this venue — there are no resting orders to show.
 * But an automated market maker has an exact, closed-form answer to the
 * question a book is really answering: how much size sits between here and
 * that price? Inverting price(q) at each level gives the contracts required to
 * walk the quote there, which is the same number a book's cumulative depth
 * column shows.
 *
 * So this is a real reading of this market's liquidity, not an ornament made
 * to look like one. The asymmetry you see between bid and ask depth is the
 * genuine curvature of the cost function around the current quote.
 */

export interface BookLevel {
  price: number;
  /** Contracts available between the previous level and this one. */
  qty: number;
  /** Cumulative contracts from the touch out to this level. */
  total: number;
  /** Credits changing hands to reach this level from the touch. */
  notional: number;
}

export interface Book {
  mid: number;
  bids: BookLevel[];
  asks: BookLevel[];
  /** Contracts to move the quote 1% in each direction. */
  depth1pcUp: number;
  depth1pcDown: number;
  spread: number;
}

/**
 * Build the ladder. `steps` levels each side, `spanPct` total distance covered.
 */
export function buildBook(
  q: number,
  b: number,
  vMax: number,
  steps = 12,
  spanPct = 0.06,
): Book {
  const mid = lmsrPrice(q, b, vMax);
  const c0 = lmsrCost(q, b, vMax);

  const side = (dir: 1 | -1): BookLevel[] => {
    const out: BookLevel[] = [];
    let prevQ = q;
    let prevTotal = 0;
    for (let i = 1; i <= steps; i++) {
      const target = mid * (1 + dir * (spanPct * i) / steps);
      if (target <= 0 || target >= vMax) break;
      const qi = qForPrice(target, b, vMax);
      const qty = Math.abs(qi - prevQ);
      const total = prevTotal + qty;
      out.push({
        price: target,
        qty,
        total,
        notional: Math.abs(lmsrCost(qi, b, vMax) - c0),
      });
      prevQ = qi;
      prevTotal = total;
    }
    return out;
  };

  const asks = side(1);
  const bids = side(-1);

  const at = (levels: BookLevel[], pct: number) => {
    const target = mid * (1 + pct);
    const hit = levels.find((l) => (pct > 0 ? l.price >= target : l.price <= target));
    return hit?.total ?? levels[levels.length - 1]?.total ?? 0;
  };

  return {
    mid,
    bids,
    asks,
    depth1pcUp: at(asks, 0.01),
    depth1pcDown: at(bids, -0.01),
    // An AMM quotes a single price; the "spread" is the round-trip cost of one
    // contract, which is the closest honest analogue.
    spread:
      lmsrCost(q + 1, b, vMax) - c0 - (c0 - lmsrCost(q - 1, b, vMax)),
  };
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/**
 * OHLC candles from a price series.
 *
 * Buckets are equal spans of simulated time across the window rather than
 * fixed calendar intervals, because the clock runs at four different speeds
 * and a fixed interval would produce either one candle or ten thousand.
 */
export function buildCandles(
  points: { t: number; p: number }[],
  trades: { tMs: number; qty: number }[],
  buckets = 64,
): Candle[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const t0 = sorted[0].t;
  const t1 = sorted[sorted.length - 1].t;
  if (t1 <= t0) {
    const p = sorted[sorted.length - 1].p;
    return [{ t: t0, o: p, h: p, l: p, c: p, v: 0 }];
  }

  const width = (t1 - t0) / buckets;
  const out: Candle[] = [];
  let idx = 0;

  for (let i = 0; i < buckets; i++) {
    const start = t0 + i * width;
    const end = start + width;
    const slice: number[] = [];
    while (idx < sorted.length && sorted[idx].t < end) {
      slice.push(sorted[idx].p);
      idx++;
    }
    if (slice.length === 0) {
      // Carry the previous close so gaps read as flat rather than vanishing.
      const prev = out[out.length - 1];
      if (!prev) continue;
      out.push({ t: start, o: prev.c, h: prev.c, l: prev.c, c: prev.c, v: 0 });
      continue;
    }
    const v = trades
      .filter((tr) => tr.tMs >= start && tr.tMs < end)
      .reduce((s, tr) => s + Math.abs(tr.qty), 0);
    out.push({
      t: start,
      o: slice[0],
      h: Math.max(...slice),
      l: Math.min(...slice),
      c: slice[slice.length - 1],
      v,
    });
  }
  return out;
}
