/**
 * Survivorship bias and diversification, computed on realised run data.
 *
 * The survivorship comparison is the point of this whole section, so the
 * experiment is kept blunt and checkable: take every artist listed at some
 * past month, buy one contract of each, hold to now. An artist that exited is
 * worth nothing. Then compute the same statistic twice — once over the names
 * that are still listed, once over everyone who was there at the start.
 *
 * The first number is what you get by pulling today's listings and looking at
 * their history. It is not a return anyone could have earned, because it
 * required knowing in advance which names would still be here.
 */

export interface CohortMember {
  artistId: number;
  name: string;
  debutTier: string;
  entryPrice: number;
  exitPrice: number;
  survived: boolean;
  ret: number;
}

export interface SurvivorshipResult {
  months: number;
  cohortSize: number;
  survivors: number;
  exited: number;
  survivorsOnly: CohortStats;
  fullCohort: CohortStats;
  /**
   * How much the survivors-only figure overstates the full-cohort one,
   * as a ratio of terminal wealth. Null where the full-cohort figure is a
   * total loss, in which case the overstatement is not a finite number.
   */
  overstatementMean: number | null;
  overstatementMedian: number | null;
  /** Annualised, for readability over long horizons. */
  cagrSurvivors: number;
  cagrFull: number;
  best: CohortMember[];
  worst: CohortMember[];
}

export interface CohortStats {
  n: number;
  mean: number;
  median: number;
  p10: number;
  p90: number;
  shareBelowZero: number;
  /** Share of total ending value contributed by the best 5% of names. */
  top5Share: number;
}

export function cohortStats(returns: number[]): CohortStats {
  if (returns.length === 0) {
    return { n: 0, mean: 0, median: 0, p10: 0, p90: 0, shareBelowZero: 0, top5Share: 0 };
  }
  const s = [...returns].sort((a, b) => a - b);
  const q = (f: number) => s[Math.min(s.length - 1, Math.floor(f * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;

  // Value share is computed on terminal wealth (1 + r), not on returns, since
  // returns can be negative and a share of a signed sum is meaningless.
  const wealth = [...s.map((r) => 1 + r)].sort((a, b) => a - b);
  const total = wealth.reduce((a, b) => a + b, 0);
  const topN = Math.max(1, Math.round(wealth.length * 0.05));
  const topSum = wealth.slice(-topN).reduce((a, b) => a + b, 0);

  return {
    n: s.length,
    mean,
    median: q(0.5),
    p10: q(0.1),
    p90: q(0.9),
    shareBelowZero: s.filter((r) => r < 0).length / s.length,
    top5Share: total > 0 ? topSum / total : 0,
  };
}

export function survivorship(members: CohortMember[], months: number): SurvivorshipResult {
  const survivors = members.filter((m) => m.survived);
  const survivorsOnly = cohortStats(survivors.map((m) => m.ret));
  const fullCohort = cohortStats(members.map((m) => m.ret));

  const years = Math.max(months / 12, 1 / 12);
  const cagr = (r: number) => Math.pow(1 + Math.max(r, -0.999), 1 / years) - 1;

  const ranked = [...members].sort((a, b) => b.ret - a.ret);

  return {
    months,
    cohortSize: members.length,
    survivors: survivors.length,
    exited: members.length - survivors.length,
    survivorsOnly,
    fullCohort,
    overstatementMean: wealthRatio(survivorsOnly.mean, fullCohort.mean),
    overstatementMedian: wealthRatio(survivorsOnly.median, fullCohort.median),
    cagrSurvivors: cagr(survivorsOnly.mean),
    cagrFull: cagr(fullCohort.mean),
    best: ranked.slice(0, 6),
    worst: ranked.slice(-6).reverse(),
  };
}

/**
 * Overstatement as a ratio of terminal wealth: (1+a)/(1+b) - 1. Returns null
 * when the full-cohort figure is a total loss — dividing by a wealth of zero
 * is not "infinite overstatement", it is an undefined comparison, and the UI
 * says so rather than rendering a silent NaN.
 */
function wealthRatio(a: number, b: number): number | null {
  const denom = 1 + b;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-6) return null;
  const r = (1 + a) / denom - 1;
  return Number.isFinite(r) ? r : null;
}

// ------------------------------------------------------------ diversification

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ma = a.slice(0, n).reduce((x, y) => x + y, 0) / n;
  const mb = b.slice(0, n).reduce((x, y) => x + y, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? num / den : 0;
}

export interface DiversificationResult {
  labels: { artistId: number; name: string }[];
  matrix: number[][];
  meanPairwise: number;
  /** Portfolio return variance against holding count. */
  curve: { holdings: number; variance: number; sd: number }[];
  /** Variance that diversification cannot remove. */
  marketFloor: number;
  /** Variance of a single average name. */
  singleName: number;
}

/**
 * Correlation matrix over aligned monthly return series, plus the variance of
 * an equally weighted portfolio as holdings are added. The curve falls toward
 * a floor rather than to zero: idiosyncratic risk diversifies away, the common
 * factor does not.
 */
export function diversification(
  series: { artistId: number; name: string; returns: number[] }[],
  maxHoldings = 40,
): DiversificationResult {
  const labels = series.map((s) => ({ artistId: s.artistId, name: s.name }));
  const n = series.length;
  const matrix: number[][] = [];
  let sum = 0;
  let pairs = 0;

  for (let i = 0; i < n; i++) {
    matrix.push([]);
    for (let j = 0; j < n; j++) {
      const c = i === j ? 1 : pearson(series[i].returns, series[j].returns);
      matrix[i].push(c);
      if (j > i) {
        sum += c;
        pairs++;
      }
    }
  }
  const meanPairwise = pairs > 0 ? sum / pairs : 0;

  const variances = series.map((s) => variance(s.returns));
  const avgVar = variances.length
    ? variances.reduce((a, b) => a + b, 0) / variances.length
    : 0;

  // Closed form for an equally weighted portfolio of k names with average
  // variance v and average pairwise correlation rho:
  //   Var = v/k + (1 - 1/k)·rho·v
  const curve: { holdings: number; variance: number; sd: number }[] = [];
  const kMax = Math.min(maxHoldings, Math.max(2, n));
  for (let k = 1; k <= kMax; k++) {
    const v = avgVar / k + (1 - 1 / k) * meanPairwise * avgVar;
    curve.push({ holdings: k, variance: v, sd: Math.sqrt(Math.max(0, v)) });
  }

  return {
    labels,
    matrix,
    meanPairwise,
    curve,
    marketFloor: meanPairwise * avgVar,
    singleName: avgVar,
  };
}

export function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}

/**
 * Month-over-month log returns, winsorised.
 *
 * Log rather than simple returns because a contract can genuinely reprice by
 * an order of magnitude in a month, and simple returns make the variance of
 * such a series meaningless. The winsorisation at +/-1.2 in log space (about
 * +230% / -70%) keeps one repricing event from dominating an entire
 * correlation matrix; without it a single market that moved from 0.01 to 100
 * produced a portfolio sigma reading in the thousands of percent.
 */
const WINSOR = 1.2;

export function toReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) {
      const r = Math.log(prices[i] / prices[i - 1]);
      out.push(Math.min(WINSOR, Math.max(-WINSOR, r)));
    }
  }
  return out;
}
