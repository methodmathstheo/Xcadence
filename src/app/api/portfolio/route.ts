import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { engine, portfolioValue } from "@/lib/engine/engine";
import { markPosition } from "@/lib/engine/trading";
import { CONCENTRATION_LIMIT } from "@/lib/sim/constants";
import { dcf, estimateInputs } from "@/lib/quant/dcf";
import { toReturns } from "@/lib/quant/cohort";
import { analysePortfolio, MIN_HISTORY, type AssetInput } from "@/lib/quant/portfolio";
import { monthKey } from "@/lib/sim/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Holdings marked live, the blotter, and the equity curve over sim time. */
export async function GET() {
  const w = await engine.ensureLoaded();

  const holdings = [];
  for (const [artistId, p] of w.positions) {
    if (Math.abs(p.qty) < 1e-9) continue;
    const a = w.artists.get(artistId);
    if (!a) continue;
    const mark = markPosition(a, p);
    holdings.push({
      artistId,
      name: a.name,
      tier: a.tier,
      active: a.active,
      qty: p.qty,
      avgPrice: mark.avgPrice,
      price: a.price,
      costBasis: p.costBasis,
      marketValue: mark.marketValue,
      unrealised: mark.unrealised,
      realised: p.realised,
    });
  }
  holdings.sort((x, y) => Math.abs(y.marketValue) - Math.abs(x.marketValue));

  const totals = portfolioValue(w);
  const grossExposure = holdings.reduce((s, h) => s + Math.abs(h.marketValue), 0);

  const [blotter, equity] = await Promise.all([
    prisma.trade.findMany({
      where: { runId: w.runId, actor: "USER" },
      orderBy: { id: "desc" },
      take: 200,
      select: {
        id: true, side: true, qty: true, cost: true, priceBefore: true,
        priceAfter: true, tMs: true, realised: true,
        artist: { select: { id: true, name: true } },
      },
    }),
    prisma.equityPoint.findMany({
      where: { runId: w.runId },
      orderBy: { tMs: "asc" },
      take: 800,
      select: { tMs: true, equity: true, cash: true, marketValue: true, realised: true },
    }),
  ]);

  // ---- mean-variance analytics over the book and a candidate set
  const heldIds = holdings.map((h) => h.artistId);
  const candidateIds = w.order
    .filter((id) => {
      const a = w.artists.get(id)!;
      return a.active && a.price > 0 && !heldIds.includes(id);
    })
    // A shortlist, not the whole universe: the covariance work is quadratic
    // and 400 names would be 80,000 pairs for no extra insight.
    .slice(0, 90);
  const analysisIds = [...heldIds, ...candidateIds];

  const points = await prisma.pricePoint.findMany({
    where: { artistId: { in: analysisIds } },
    orderBy: { tMs: "asc" },
    select: { artistId: true, tMs: true, price: true },
  });
  // One close per simulated month; PricePoint also carries a row per trade.
  const monthly = new Map<number, Map<number, number>>();
  for (const p of points) {
    const m = monthly.get(p.artistId) ?? new Map<number, number>();
    m.set(monthKey(p.tMs), p.price);
    monthly.set(p.artistId, m);
  }

  const assets: AssetInput[] = [];
  for (const id of analysisIds) {
    const a = w.artists.get(id);
    if (!a) continue;
    {
      const closes = [...(monthly.get(id) ?? new Map<number, number>())]
        .sort((x, y) => x[0] - y[0])
        .map(([, v]) => v);
      assets.push({
        artistId: id,
        name: a.name,
        tier: a.tier,
        price: a.price,
        fairValue: dcf(estimateInputs(a)).pvPerContract,
        returns: toReturns(closes),
        qty: w.positions.get(id)?.qty ?? 0,
      });
    }
  }

  const analysis = analysePortfolio(assets, w.account.cash, { seed: w.seed });

  // ---- growth: the book against the equal-weighted index, rebased to 100
  const indexPoints = await prisma.indexPoint.findMany({
    where: { runId: w.runId },
    orderBy: { tMs: "asc" },
    take: 800,
    select: { tMs: true, equal: true },
  });

  return NextResponse.json({
    simMs: w.simMs,
    analysis,
    benchmark: indexPoints,
    historyReady: assets.some((a) => a.returns.length >= MIN_HISTORY),
    account: {
      cash: w.account.cash,
      startingCash: w.account.startingCash,
      realisedPnl: w.account.realisedPnl,
      sessionStartEquity: w.account.sessionStartEquity,
      ...totals,
      sessionPnl: totals.equity - w.account.sessionStartEquity,
      totalReturn: totals.equity / w.account.startingCash - 1,
    },
    holdings: holdings.map((h) => ({
      ...h,
      // Concentration is measured against equity, so a large position funded
      // by cash still counts against you.
      weight: totals.equity > 0 ? Math.abs(h.marketValue) / totals.equity : 0,
      concentrated:
        totals.equity > 0 && Math.abs(h.marketValue) / totals.equity > CONCENTRATION_LIMIT,
    })),
    grossExposure,
    concentrationLimit: CONCENTRATION_LIMIT,
    blotter,
    equity,
  });
}
