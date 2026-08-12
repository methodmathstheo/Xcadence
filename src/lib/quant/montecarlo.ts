import { RNG } from "@/lib/rng";

/**
 * Monte Carlo on a royalty claim.
 *
 * Each path walks monthly log-growth with a log-normal body and a Pareto jump,
 * against a monthly hazard of permanent exit — the same shape as the engine's
 * process, parameterised from *observable* inputs. Terminal value is the
 * discounted sum of royalties actually collected along that path.
 *
 * The point of running this rather than a single DCF is that the mean and the
 * median are different numbers here, and the gap between them is the whole
 * story of the asset class. A DCF returns one number and quietly implies it is
 * the typical outcome. It is not: it is close to the mean, and the mean is
 * dragged by a small number of paths that most investors will never draw.
 */

export interface McInputs {
  monthlyRoyalty: number;
  /** Annual drift applied to log growth. */
  growthAnnual: number;
  /** Annualised volatility of log growth. */
  volAnnual: number;
  hazardMonthly: number;
  discountAnnual: number;
  horizonMonths: number;
  /** Monthly probability of a power-law jump. */
  breakoutMonthly: number;
  paths: number;
  seed: number;
  /** Capital committed, used for the probability-of-loss figures. */
  cost?: number;
}

export interface McResult {
  terminal: { mean: number; median: number; p10: number; p90: number; p99: number; sd: number };
  /** Share of paths where the artist exits before collecting anything material. */
  probTotalLoss: number;
  /** Share of paths returning less than the capital committed. */
  probBelowCost: number;
  meanMedianGap: number;
  /** Percentile bands of cumulative collected value, by month. */
  fan: { month: number; p10: number; p25: number; p50: number; p75: number; p90: number }[];
  histogram: { lo: number; hi: number; count: number }[];
  /** Share of total value across all paths contributed by the best 1%. */
  top1Share: number;
  paths: number;
}

const BANDS = [0.1, 0.25, 0.5, 0.75, 0.9] as const;

export function monteCarlo(input: McInputs): McResult {
  const {
    monthlyRoyalty, growthAnnual, volAnnual, hazardMonthly, discountAnnual,
    horizonMonths, breakoutMonthly, paths, seed, cost = 0,
  } = input;

  const rng = new RNG(seed);
  const muMonthly = Math.log(1 + Math.max(growthAnnual, -0.95)) / 12;
  const sigmaMonthly = volAnnual / Math.sqrt(12);
  const discMonthly = Math.pow(1 + discountAnnual, 1 / 12);

  const terminals = new Float64Array(paths);
  // Sampled months for the fan chart; storing every path at every month would
  // be 10k x 120 floats for no visual gain.
  const sampleMonths: number[] = [];
  for (let m = 1; m <= horizonMonths; m++) {
    if (m === 1 || m === horizonMonths || m % Math.max(1, Math.round(horizonMonths / 40)) === 0) {
      sampleMonths.push(m);
    }
  }
  const cum: Float64Array[] = sampleMonths.map(() => new Float64Array(paths));

  for (let p = 0; p < paths; p++) {
    const r = rng.fork(p);
    let royalty = monthlyRoyalty;
    let alive = true;
    let acc = 0;
    let si = 0;

    for (let m = 1; m <= horizonMonths; m++) {
      if (alive) {
        // Growth first, then the exit check: an artist earns the month it dies.
        const jump = r.bool(breakoutMonthly) ? Math.min(9, r.pareto(1.35, 1.3)) : 1;
        royalty = Math.max(
          0,
          royalty * Math.exp(muMonthly + sigmaMonthly * r.normal()) * jump,
        );
        acc += royalty / Math.pow(discMonthly, m);
        if (r.bool(hazardMonthly)) alive = false;
      }
      if (si < sampleMonths.length && sampleMonths[si] === m) {
        cum[si][p] = acc;
        si++;
      }
    }
    terminals[p] = acc;
  }

  const sorted = Float64Array.from(terminals).sort();
  const q = (f: number) => sorted[Math.min(paths - 1, Math.max(0, Math.floor(f * paths)))];
  const mean = sorted.reduce((a, b) => a + b, 0) / paths;
  const median = q(0.5);
  const sd = Math.sqrt(
    sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, paths - 1),
  );

  // "Total loss" means the claim never produced anything worth having, which
  // for a royalty stream is a near-immediate exit rather than a literal zero.
  const lossThreshold = monthlyRoyalty * 3;
  let totalLoss = 0;
  let belowCost = 0;
  for (let i = 0; i < paths; i++) {
    if (sorted[i] < lossThreshold) totalLoss++;
    if (cost > 0 && sorted[i] < cost) belowCost++;
  }

  const top1Count = Math.max(1, Math.round(paths * 0.01));
  let top1Sum = 0;
  for (let i = paths - top1Count; i < paths; i++) top1Sum += sorted[i];
  const total = mean * paths;

  const fan = sampleMonths.map((m, i) => {
    const s = Float64Array.from(cum[i]).sort();
    const pick = (f: number) => s[Math.min(paths - 1, Math.floor(f * paths))];
    return {
      month: m,
      p10: pick(BANDS[0]), p25: pick(BANDS[1]), p50: pick(BANDS[2]),
      p75: pick(BANDS[3]), p90: pick(BANDS[4]),
    };
  });

  return {
    terminal: { mean, median, p10: q(0.1), p90: q(0.9), p99: q(0.99), sd },
    probTotalLoss: totalLoss / paths,
    probBelowCost: cost > 0 ? belowCost / paths : 0,
    meanMedianGap: median > 0 ? mean / median - 1 : 0,
    fan,
    histogram: histogram(sorted, 34),
    top1Share: total > 0 ? top1Sum / total : 0,
    paths,
  };
}

/**
 * Bins are cut at the 99th percentile rather than the maximum. With a
 * power-law tail a single path can be a hundred times the 99th percentile, and
 * a max-width histogram is then one visible bar and thirty-three empty ones.
 */
function histogram(sorted: Float64Array, bins: number) {
  const n = sorted.length;
  const hi = sorted[Math.min(n - 1, Math.floor(n * 0.99))] || 1;
  const lo = sorted[0];
  const width = (hi - lo) / bins || 1;
  const out = Array.from({ length: bins }, (_, i) => ({
    lo: lo + i * width,
    hi: lo + (i + 1) * width,
    count: 0,
  }));
  for (let i = 0; i < n; i++) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((sorted[i] - lo) / width)));
    out[idx].count++;
  }
  return out;
}
