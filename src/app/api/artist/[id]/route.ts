import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { engine } from "@/lib/engine/engine";
import { SimulatedDataProvider } from "@/lib/data/simulated";
import { dcf, discountSensitivity, estimateInputs } from "@/lib/quant/dcf";
import { DEFAULT_DISCOUNT } from "@/lib/sim/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything an artist page needs.
 *
 * Note what is absent: `trueQuality`, `hazardRate`, `driftMu`, `sigma` and
 * `breakoutP` are never serialised here. The valuation below is built from
 * observable fundamentals and a tier-based hazard *estimate*, exactly like the
 * market's. The run inspector is the only surface that sees the real ones.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  const w = await engine.ensureLoaded();
  const a = w.artists.get(id);
  if (!a) return NextResponse.json({ error: "no such artist" }, { status: 404 });

  const discount = Number(new URL(req.url).searchParams.get("r")) || DEFAULT_DISCOUNT;
  const provider = new SimulatedDataProvider(w.runId);

  const [history, events, prices, trades] = await Promise.all([
    provider.getArtistHistory(id),
    prisma.marketEvent.findMany({
      where: { artistId: id },
      orderBy: { id: "desc" },
      take: 60,
      select: { id: true, kind: true, magnitude: true, headline: true, tMs: true },
    }),
    prisma.pricePoint.findMany({
      where: { artistId: id },
      orderBy: { tMs: "asc" },
      take: 600,
      select: { tMs: true, price: true },
    }),
    prisma.trade.findMany({
      where: { artistId: id },
      orderBy: { id: "desc" },
      take: 40,
      select: {
        id: true, actor: true, side: true, qty: true, cost: true,
        priceBefore: true, priceAfter: true, tMs: true,
        bot: { select: { name: true, strategy: true } },
      },
    }),
  ]);

  const inputs = estimateInputs(a, discount);
  const valuation = dcf(inputs);
  const sensitivity = discountSensitivity(inputs);
  const position = w.positions.get(id) ?? null;

  return NextResponse.json({
    simMs: w.simMs,
    artist: {
      id: a.id,
      name: a.name,
      genre: a.genre,
      tier: a.tier,
      active: a.active,
      debutMs: a.debutMs,
      exitMs: a.exitMs,
      exitReason: a.exitReason,
      listeners: a.listeners,
      growth30: a.listeners30 > 0 ? a.listeners / a.listeners30 - 1 : 0,
      growth90: a.listeners90 > 0 ? a.listeners / a.listeners90 - 1 : 0,
      volatility: a.volatility,
      royaltyRate: a.royaltyRate,
      monthlyRoyalty: a.listeners * a.royaltyRate,
      price: a.price,
      prevPrice: a.prevPrice,
      q: a.q,
      b: a.b,
      vMax: a.vMax,
      unitScale: a.unitScale,
    },
    history,
    events,
    prices,
    // Intra-month quote detail lives only in memory, so the live chart is
    // stitched from persisted month closes plus this session's ring buffer.
    ring: w.priceRing.get(id) ?? [],
    trades: trades.map((t) => ({
      ...t,
      counterparty: t.bot ? `${t.bot.name} · ${t.bot.strategy}` : "You",
    })),
    valuation: {
      pv: valuation.pv,
      perContract: valuation.pvPerContract,
      impliedMultiple: valuation.impliedMultiple,
      annualRoyalty: valuation.annualRoyalty,
      frontLoad: valuation.frontLoad,
      inputs: valuation.inputs,
      divergence:
        valuation.pvPerContract > 0
          ? a.price / valuation.pvPerContract - 1
          : 0,
      sensitivity: sensitivity.curve,
      halvingRate: sensitivity.halvingRate,
    },
    position,
  });
}
