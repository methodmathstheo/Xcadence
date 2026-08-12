import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { engine, portfolioValue } from "@/lib/engine/engine";
import { markPosition } from "@/lib/engine/trading";
import { CONCENTRATION_LIMIT } from "@/lib/sim/constants";

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

  return NextResponse.json({
    simMs: w.simMs,
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
