/**
 * Deterministic seeded RNG.
 *
 * Every stochastic decision in the engine draws from one of these, and every
 * stream is derived from (runSeed, label, index) via a string hash — so the
 * order in which artists are processed never changes the numbers any one of
 * them gets. A run is reproducible from its seed alone.
 */

/** FNV-1a style string hash → uint32. Used to fork independent streams. */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261 >>> 0;
  const s = parts.join("");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class RNG {
  private s: number;

  constructor(seed: number | string) {
    this.s = (typeof seed === "string" ? hashSeed(seed) : seed >>> 0) || 0x9e3779b9;
  }

  /** Fork a labelled child stream. Independent of call order. */
  fork(...parts: (string | number)[]): RNG {
    return new RNG(hashSeed(this.s, ...parts));
  }

  /** mulberry32 — small, fast, good enough equidistribution for a sim. */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [lo, hi). */
  uniform(lo = 0, hi = 1): number {
    return lo + this.next() * (hi - lo);
  }

  /** Integer in [lo, hi]. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Box–Muller. */
  normal(mean = 0, sd = 1): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Log-normal body: exp(N(mu, sigma)). Right-skewed by construction. */
  logNormal(mu: number, sigma: number): number {
    return Math.exp(this.normal(mu, sigma));
  }

  exponential(rate: number): number {
    return -Math.log(1 - this.next()) / rate;
  }

  /**
   * Pareto (power-law) draw with shape alpha and scale xm, via inverse CDF.
   * alpha < 2 → infinite variance; alpha < 1 → infinite mean. This is what
   * produces the handful of outcomes that carry an entire cohort.
   */
  pareto(alpha: number, xm = 1): number {
    return xm / Math.pow(1 - this.next(), 1 / alpha);
  }

  /** Weighted choice over [item, weight] pairs. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((a, e) => a + e[1], 0);
    let r = this.next() * total;
    for (const [item, w] of entries) {
      r -= w;
      if (r <= 0) return item;
    }
    return entries[entries.length - 1][0];
  }
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 on erf). */
export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}
