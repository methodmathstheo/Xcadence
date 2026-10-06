import { RNG } from "@/lib/rng";

/**
 * Data for the landing page's live panels.
 *
 * These are illustrations, not the venue. The landing page sits in front of
 * the login wall, so it cannot reach the engine — and it should not try: a
 * marketing page that waits on a tick loop to boot is a marketing page that
 * sometimes shows nothing.
 *
 * Two consequences shape everything here. Every series starts from a seeded
 * RNG so the server render and the first client render are byte-identical and
 * hydration is quiet; and the listings are symbols rather than people. The
 * venue itself lists real artists, with disclosure, behind the login. The
 * shopfront has no business putting their names next to invented prices.
 */

/** Ticker symbols. Deliberately codes, not names. */
export const SYMBOLS = [
  "AURA", "VELD", "KSMT", "ORBT", "NMBS", "LTHE", "SABR", "DRFT",
  "MRNA", "HALC", "PRSM", "VYNL", "CDNZ", "ECHO", "TNDR", "GLSS",
] as const;

export interface Tick {
  sym: string;
  price: number;
  prev: number;
  /** +1 up, -1 down, 0 unchanged — drives the flash colour. */
  dir: number;
  listeners: number;
}

/** Opening state. Seeded, so SSR and the first client paint agree. */
export function initialTicks(seed = 20260901): Tick[] {
  const rng = new RNG(seed);
  return SYMBOLS.map((sym) => {
    const price = rng.uniform(11, 210);
    return {
      sym,
      price,
      prev: price,
      dir: 0,
      listeners: Math.round(rng.uniform(0.4, 38) * 1_000_000),
    };
  });
}

/**
 * One step of a bounded random walk.
 *
 * Mean-reverting on purpose: an unbounded walk left running on a page someone
 * leaves open drifts to absurd numbers, and the landing page is exactly the
 * page people leave open. The same mistake, bounded the same way, is why the
 * engine's passive flow is an OU process.
 */
export function stepTicks(ticks: Tick[], rng: RNG): Tick[] {
  return ticks.map((t) => {
    const anchor = 60;
    const pull = (Math.log(anchor) - Math.log(t.price)) * 0.012;
    const shock = (rng.next() - 0.5) * 0.028;
    const next = Math.max(4, t.price * Math.exp(pull + shock));
    const moved = Math.abs(next - t.price) > 1e-6;
    return {
      ...t,
      prev: t.price,
      price: next,
      dir: moved ? (next > t.price ? 1 : -1) : 0,
      listeners: Math.max(
        50_000,
        Math.round(t.listeners * (1 + (rng.next() - 0.5) * 0.004)),
      ),
    };
  });
}

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** A plausible candle series: drifting, with the occasional jump. */
export function initialCandles(count = 48, seed = 7781): Candle[] {
  const rng = new RNG(seed);
  const out: Candle[] = [];
  let last = 58;
  for (let i = 0; i < count; i++) {
    out.push(nextCandle(last, rng));
    last = out[out.length - 1].c;
  }
  return out;
}

export function nextCandle(open: number, rng: RNG): Candle {
  const drift = 0.004;
  const vol = 0.032;
  // One bar in twenty-five runs away from the body. The whole argument of the
  // venue is that the tail is where the return lives, so the illustration
  // should not be a tidy sine wave.
  const jump = rng.next() < 0.04 ? rng.uniform(0.06, 0.2) * (rng.next() < 0.7 ? 1 : -1) : 0;
  const close = Math.max(6, open * Math.exp(drift + (rng.next() - 0.5) * vol + jump));
  const hi = Math.max(open, close) * (1 + rng.uniform(0, 0.014));
  const lo = Math.min(open, close) * (1 - rng.uniform(0, 0.014));
  return {
    o: open,
    c: close,
    h: hi,
    l: lo,
    v: rng.uniform(0.25, 1) ** 2 * 1400 + 120,
  };
}

/**
 * LMSR depth ladder around a mid.
 *
 * Built from the real cost curve rather than invented numbers: price is
 * `vMax · σ(q/b)`, so the size resting at each level is the inverse of that,
 * which is why the ladder thins as it walks away from the mid.
 */
export function book(mid: number, levels = 7) {
  const b = 900;
  const vMax = mid * 3.1;
  const qAt = (p: number) => b * Math.log(p / (vMax - p));
  const q0 = qAt(mid);

  const side = (sign: 1 | -1) => {
    let total = 0;
    return Array.from({ length: levels }, (_, i) => {
      const price = mid * (1 + sign * 0.0022 * (i + 1));
      const qty = Math.abs(qAt(price) - q0) / (i + 1) + 40;
      total += qty;
      return { price, qty, total };
    });
  };

  return { asks: side(1), bids: side(-1) };
}

/** Equity curve for the portfolio panel: a book against its benchmark. */
export function equitySeries(count = 60, seed = 4242) {
  const rng = new RNG(seed);
  const out: { book: number; index: number }[] = [];
  let bk = 100;
  let ix = 100;
  for (let i = 0; i < count; i++) {
    ix *= 1 + 0.004 + (rng.next() - 0.5) * 0.012;
    // Higher beta and fatter tails than the index — which is the point of the
    // comparison, not an accident of the numbers.
    bk *= 1 + 0.006 + (rng.next() - 0.5) * 0.034 + (rng.next() < 0.05 ? 0.05 : 0);
    out.push({ book: bk, index: ix });
  }
  return out;
}

/**
 * Kaplan-Meier survival, two debut cohorts, with a Greenwood-style band.
 *
 * The shape is the finding the lab exists to show: the cohort that starts
 * smaller does not converge on the one that starts larger, it falls away from
 * it, and the gap is widest exactly where the survivors look most impressive.
 */
export function survivalCurves(months = 42) {
  const mk = (hazard: number, seed: number) => {
    const rng = new RNG(seed);
    let s = 1;
    let varSum = 0;
    return Array.from({ length: months }, (_, i) => {
      const h = hazard * (1 + (rng.next() - 0.5) * 0.3);
      s *= 1 - h;
      varSum += h / (1 - h) / Math.max(20, 220 - i * 4);
      const se = s * Math.sqrt(varSum);
      return {
        t: i,
        s,
        lo: Math.max(0, s - 1.96 * se),
        hi: Math.min(1, s + 1.96 * se),
      };
    });
  };
  return { established: mk(0.009, 991), emerging: mk(0.031, 553) };
}
