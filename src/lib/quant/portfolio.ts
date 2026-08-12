import { pearson, variance } from "@/lib/quant/cohort";

/**
 * Mean-variance analytics over the live book.
 *
 * Expected returns here are not forecasts of anything real. They come from one
 * assumption, stated once and used everywhere below: a contract priced away
 * from its DCF closes some fraction of that gap each month.
 *
 *   E[r_i] = CONVERGENCE · ln(fair_i / price_i)
 *
 * That assumption is doing all the work, and the run inspector is the place to
 * see how badly it holds — the market does not reliably converge, and the DCF
 * it would converge to is itself built on a tier-averaged hazard rate. Treat
 * every expected return on the portfolio page as "what mean-variance says if
 * you believe the model", not as a view.
 *
 * Risk, by contrast, is measured rather than assumed: covariances come from
 * realised monthly log returns.
 */

/** Fraction of the price/DCF gap assumed to close per simulated month. */
export const CONVERGENCE = 0.06;
/** Months of history a name needs before it can be analysed. */
export const MIN_HISTORY = 5;
/**
 * Floor on idiosyncratic volatility when forming the appraisal ratio.
 *
 * The ratio is alpha divided by idiosyncratic risk, and a name whose price
 * barely moved over its short history has almost none — which sent one
 * candidate to an appraisal of 37.9 purely because its denominator was near
 * zero. That is a measurement artefact, not an opportunity.
 */
const MIN_IDIO_VOL = 0.02;

export interface AssetInput {
  artistId: number;
  name: string;
  tier: string;
  price: number;
  fairValue: number;
  /** Monthly log returns, oldest first. */
  returns: number[];
  /** Signed contracts currently held. Zero for candidates. */
  qty: number;
}

export interface AssetStats {
  artistId: number;
  name: string;
  tier: string;
  price: number;
  expectedMonthly: number;
  volMonthly: number;
  /** Sensitivity to the current book. Undefined when the book is empty. */
  beta: number;
  /** Expected return in excess of what beta alone would earn. */
  alpha: number;
  idioVol: number;
  /** alpha / idiosyncratic vol. The classic ranking for a marginal addition. */
  appraisal: number;
  correlation: number;
  weight: number;
  marketValue: number;
}

export interface PortfolioStats {
  /** Number of names with a live position. */
  holdings: number;
  grossExposure: number;
  netExposure: number;
  cash: number;
  equity: number;
  expectedMonthly: number;
  volMonthly: number;
  /** Return per unit of risk. Credits earn nothing idle, so rf = 0 here. */
  sharpe: number;
  /** 1 / Σw², the count of equally weighted names this book is as diverse as. */
  effectiveHoldings: number;
  largestWeight: number;
  largestName: string;
  meanPairwiseCorr: number;
  /** Volatility that would remain if every idiosyncratic risk were removed. */
  systematicShare: number;
}

export interface FrontierPoint {
  vol: number;
  ret: number;
  /** True for the book as it actually stands. */
  current?: boolean;
}

export interface PortfolioAnalysis {
  stats: PortfolioStats;
  positions: AssetStats[];
  /** Candidates ranked by appraisal ratio — what to add. */
  suggestions: AssetStats[];
  /** Held names whose marginal contribution is negative — what to trim. */
  trims: AssetStats[];
  frontier: FrontierPoint[];
  /** Same book, equally weighted, for comparison. */
  equalWeight: { vol: number; ret: number } | null;
  assumption: { convergence: number; minHistory: number };
}

function alignedCov(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const av = a.slice(a.length - n);
  const bv = b.slice(b.length - n);
  const ma = av.reduce((x, y) => x + y, 0) / n;
  const mb = bv.reduce((x, y) => x + y, 0) / n;
  let s = 0;
  for (let i = 0; i < n; i++) s += (av[i] - ma) * (bv[i] - mb);
  return s / (n - 1);
}

/** Weighted sum of return series, truncated to the shortest history. */
function combine(series: number[][], weights: number[]): number[] {
  if (series.length === 0) return [];
  const n = Math.min(...series.map((s) => s.length));
  if (n < 3) return [];
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    const off = s.length - n;
    for (let t = 0; t < n; t++) out[t] += weights[i] * s[off + t];
  }
  return out;
}

export function analysePortfolio(
  assets: AssetInput[],
  cash: number,
  opts: { maxSuggestions?: number; frontierSamples?: number; seed?: number } = {},
): PortfolioAnalysis {
  const usable = assets.filter((a) => a.returns.length >= MIN_HISTORY && a.price > 0);

  const expected = (a: AssetInput) =>
    a.fairValue > 0 ? CONVERGENCE * Math.log(a.fairValue / a.price) : 0;

  const held = usable.filter((a) => Math.abs(a.qty) > 1e-9);
  const marketValues = held.map((a) => a.qty * a.price);
  const gross = marketValues.reduce((s, v) => s + Math.abs(v), 0);
  const net = marketValues.reduce((s, v) => s + v, 0);
  const equity = cash + net;

  // Weights are against equity, so cash dilutes risk exactly as it should.
  const weights = held.map((a, i) => (equity > 0 ? marketValues[i] / equity : 0));
  const portfolioReturns = combine(
    held.map((a) => a.returns),
    weights,
  );
  const portVar = variance(portfolioReturns);
  const portVol = Math.sqrt(Math.max(0, portVar));
  const portExpected = held.reduce((s, a, i) => s + weights[i] * expected(a), 0);

  const statsFor = (a: AssetInput, weight: number, marketValue: number): AssetStats => {
    const v = variance(a.returns);
    const cov = portfolioReturns.length >= 3 ? alignedCov(a.returns, portfolioReturns) : 0;
    const beta = portVar > 1e-12 ? cov / portVar : 0;
    const mu = expected(a);
    const alpha = mu - beta * portExpected;
    const idioVar = Math.max(0, v - beta * beta * portVar);
    const idioVol = Math.sqrt(idioVar);
    return {
      artistId: a.artistId,
      name: a.name,
      tier: a.tier,
      price: a.price,
      expectedMonthly: mu,
      volMonthly: Math.sqrt(Math.max(0, v)),
      beta,
      alpha,
      idioVol,
      appraisal: alpha / Math.max(idioVol, MIN_IDIO_VOL),
      correlation:
        portfolioReturns.length >= 3 ? pearson(a.returns, portfolioReturns) : 0,
      weight,
      marketValue,
    };
  };

  const positions = held.map((a, i) => statsFor(a, weights[i], marketValues[i]));

  const candidates = usable
    .filter((a) => Math.abs(a.qty) < 1e-9)
    .map((a) => statsFor(a, 0, 0));

  // An asset earns a place if its expected return beats what its exposure to
  // the book you already own would have earned anyway. Ranking on raw expected
  // return instead just reproduces the existing book's tilt.
  const suggestions = candidates
    .filter((c) => c.alpha > 0)
    .sort((x, y) => y.appraisal - x.appraisal)
    .slice(0, opts.maxSuggestions ?? 8);

  const trims = positions
    .filter((p) => p.alpha < 0 || Math.abs(p.weight) > 0.2)
    .sort((x, y) => x.appraisal - y.appraisal)
    .slice(0, 6);

  // ---- correlation summary across the held book
  let corrSum = 0;
  let pairs = 0;
  for (let i = 0; i < held.length; i++) {
    for (let j = i + 1; j < held.length; j++) {
      corrSum += pearson(held[i].returns, held[j].returns);
      pairs++;
    }
  }
  const meanCorr = pairs > 0 ? corrSum / pairs : 0;
  const avgVar =
    held.length > 0
      ? held.reduce((s, a) => s + variance(a.returns), 0) / held.length
      : 0;

  // Effective holdings is 1/sum(w^2) over the *invested* book. Using weights
  // against equity instead lets cash inflate it — a five-name book read as
  // 23 effective holdings, which is worse than useless.
  const investedWeights = gross > 0 ? marketValues.map((v) => Math.abs(v) / gross) : [];
  const sumW2 = investedWeights.reduce((s, w) => s + w * w, 0);
  const largest = positions.reduce(
    (best, p) => (Math.abs(p.weight) > Math.abs(best?.weight ?? 0) ? p : best),
    positions[0],
  );

  const stats: PortfolioStats = {
    holdings: held.length,
    grossExposure: gross,
    netExposure: net,
    cash,
    equity,
    expectedMonthly: portExpected,
    volMonthly: portVol,
    sharpe: portVol > 1e-9 ? portExpected / portVol : 0,
    effectiveHoldings: sumW2 > 1e-12 ? 1 / sumW2 : 0,
    largestWeight: largest?.weight ?? 0,
    largestName: largest?.name ?? "—",
    meanPairwiseCorr: meanCorr,
    systematicShare: avgVar > 1e-12 ? Math.min(1, (meanCorr * avgVar) / avgVar) : 0,
  };

  // ---- frontier: random long-only mixes over the book plus its best candidates
  const pool = [...held, ...suggestions.map((s) => usable.find((u) => u.artistId === s.artistId)!)]
    .filter(Boolean)
    .slice(0, 16);

  const frontier: FrontierPoint[] = [];
  if (pool.length >= 2) {
    let seed = (opts.seed ?? 1) >>> 0 || 1;
    const rand = () => {
      // xorshift32, kept local so the scatter is stable across reloads.
      seed ^= seed << 13; seed >>>= 0;
      seed ^= seed >>> 17;
      seed ^= seed << 5; seed >>>= 0;
      return seed / 4294967296;
    };
    const samples = opts.frontierSamples ?? 400;
    for (let s = 0; s < samples; s++) {
      const raw = pool.map(() => rand());
      const total = raw.reduce((a, b) => a + b, 0) || 1;
      const w = raw.map((x) => x / total);
      const r = combine(pool.map((p) => p.returns), w);
      if (r.length < 3) continue;
      frontier.push({
        vol: Math.sqrt(Math.max(0, variance(r))),
        ret: pool.reduce((acc, p, i) => acc + w[i] * expected(p), 0),
      });
    }
    if (portfolioReturns.length >= 3) {
      frontier.push({ vol: portVol, ret: portExpected, current: true });
    }
  }

  let equalWeight: { vol: number; ret: number } | null = null;
  if (held.length >= 2) {
    const w = held.map(() => 1 / held.length);
    const r = combine(held.map((a) => a.returns), w);
    if (r.length >= 3) {
      equalWeight = {
        vol: Math.sqrt(Math.max(0, variance(r))),
        ret: held.reduce((acc, a, i) => acc + w[i] * expected(a), 0),
      };
    }
  }

  return {
    stats,
    positions: positions.sort((a, b) => Math.abs(b.marketValue) - Math.abs(a.marketValue)),
    suggestions,
    trims,
    frontier,
    equalWeight,
    assumption: { convergence: CONVERGENCE, minHistory: MIN_HISTORY },
  };
}
