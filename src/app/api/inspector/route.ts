import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { engine } from "@/lib/engine/engine";
import { dcf, estimateInputs } from "@/lib/quant/dcf";
import { targetListeners } from "@/lib/sim/dynamics";
import { pearson } from "@/lib/quant/cohort";
import { TIER_HAZARD_EST, type Tier } from "@/lib/sim/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ground truth for the current run.
 *
 * Everything here is deliberately hidden from every other surface. The point
 * is to be able to ask a question the market itself cannot: given what is
 * actually true about these artists, is the price right? The bots see only
 * observable fundamentals and a hazard rate inferred from tier, so any
 * systematic gap between price and true value is a real inefficiency and not
 * an artefact of the market being told the answer.
 */
export async function GET() {
  const w = await engine.ensureLoaded();

  const rows = [];
  const lnPriceVsTrue: number[] = [];
  const lnPriceVsNaive: number[] = [];
  const qualities: number[] = [];
  const logPrices: number[] = [];

  for (const id of w.order) {
    const a = w.artists.get(id)!;
    if (!a.active) continue;

    const naive = dcf(estimateInputs(a)).pvPerContract;
    // True value: the artist's real hazard and real drift.
    const trueValue =
      dcf({
        monthlyRoyalty: a.listeners * a.royaltyRate,
        growthAnnual: Math.exp(a.driftMu * 12) - 1,
        hazardMonthly: a.hazardRate,
        discountAnnual: 0.14,
        unitScale: a.unitScale,
      }).pvPerContract;

    if (a.price > 0 && trueValue > 0) {
      lnPriceVsTrue.push(Math.log(a.price / trueValue));
      qualities.push(a.trueQuality);
      logPrices.push(Math.log(a.price));
    }
    if (a.price > 0 && naive > 0) lnPriceVsNaive.push(Math.log(a.price / naive));

    rows.push({
      id: a.id,
      name: a.name,
      tier: a.tier,
      debutTier: a.debutTier,
      listeners: a.listeners,
      price: a.price,
      naiveValue: naive,
      trueValue,
      mispricing: trueValue > 0 ? a.price / trueValue - 1 : 0,
      // ---- hidden ground truth
      trueQuality: a.trueQuality,
      hazardRate: a.hazardRate,
      hazardAssumed: TIER_HAZARD_EST[a.tier as Tier] ?? 0.01,
      hazardError: (TIER_HAZARD_EST[a.tier as Tier] ?? 0.01) - a.hazardRate,
      driftMu: a.driftMu,
      sigma: a.sigma,
      breakoutP: a.breakoutP,
      targetListeners: targetListeners(a),
      /** Above 1 means the artist is currently trading above their own level. */
      stretch: a.listeners / targetListeners(a),
    });
  }

  rows.sort((x, y) => Math.abs(y.mispricing) - Math.abs(x.mispricing));

  // ---- bots
  const bots = await prisma.bot.findMany({
    where: { runId: w.runId },
    select: { id: true, name: true, strategy: true, startCash: true },
  });
  const byId = new Map(bots.map((b) => [b.id, b]));
  const strategies = new Map<
    string,
    { strategy: string; bots: number; equity: number; startCash: number; positions: number; gross: number }
  >();

  for (const bot of w.bots) {
    const meta = byId.get(bot.id);
    let mv = 0;
    let gross = 0;
    let open = 0;
    for (const [artistId, p] of bot.positions) {
      const a = w.artists.get(artistId);
      if (!a || Math.abs(p.qty) < 1e-9) continue;
      mv += p.qty * a.price;
      gross += Math.abs(p.qty * a.price);
      open++;
    }
    const s = strategies.get(bot.strategy) ?? {
      strategy: bot.strategy, bots: 0, equity: 0, startCash: 0, positions: 0, gross: 0,
    };
    s.bots++;
    s.equity += bot.cash + mv;
    s.startCash += meta?.startCash ?? 0;
    s.positions += open;
    s.gross += gross;
    strategies.set(bot.strategy, s);
  }

  const botStats = [...strategies.values()].map((s) => ({
    ...s,
    pnl: s.equity - s.startCash,
    ret: s.startCash > 0 ? s.equity / s.startCash - 1 : 0,
  }));
  botStats.sort((a, b) => b.ret - a.ret);

  // ---- calibration: does the market pay more for genuinely better artists?
  // Bucketed medians, not means. Mispricing is a ratio and its distribution
  // has the same power-law tail as everything else here: a single artist
  // priced at 200x truth pulled one decile's mean to +498% while every
  // artist in it was near fair. The median is the honest summary.
  const buckets: { quality: number[]; mispricing: number[]; hazardError: number[] }[] =
    Array.from({ length: 10 }, () => ({ quality: [], mispricing: [], hazardError: [] }));
  const byQuality = [...rows].sort((a, b) => a.trueQuality - b.trueQuality);
  byQuality.forEach((r, i) => {
    const b = buckets[Math.min(9, Math.floor((i / byQuality.length) * 10))];
    b.quality.push(r.trueQuality);
    b.mispricing.push(r.mispricing);
    b.hazardError.push(r.hazardError);
  });
  const deciles = buckets.map((b, i) => ({
    decile: i + 1,
    n: b.quality.length,
    meanQuality: median(b.quality),
    meanMispricing: median(b.mispricing),
    meanHazardError: median(b.hazardError),
  }));

  return NextResponse.json({
    run: {
      seed: w.seed,
      simMs: w.simMs,
      startMs: w.startMs,
      tick: w.tick,
      speed: w.speed,
      running: w.running,
      lastMonthKey: w.lastMonthKey,
      artists: w.order.length,
      active: rows.length,
    },
    efficiency: {
      /** Mean absolute log gap between price and true value. */
      meanAbsLogErrorTrue: meanAbs(lnPriceVsTrue),
      medianAbsLogErrorTrue: medianAbs(lnPriceVsTrue),
      /** Same against the public model, for comparison. */
      meanAbsLogErrorNaive: meanAbs(lnPriceVsNaive),
      /** Systematic bias: positive means the market is dear against truth. */
      meanLogBiasTrue: mean(lnPriceVsTrue),
      /** Does price rank artists by hidden quality at all? */
      corrQualityPrice: pearson(qualities, logPrices),
      n: lnPriceVsTrue.length,
    },
    deciles,
    bots: botStats,
    artists: rows.slice(0, 200),
  });
}

function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function meanAbs(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + Math.abs(b), 0) / xs.length : 0;
}
function medianAbs(xs: number[]) {
  if (!xs.length) return 0;
  const s = xs.map(Math.abs).sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
