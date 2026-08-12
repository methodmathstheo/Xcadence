import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { engine } from "@/lib/engine/engine";
import { categoryOf, genreFor } from "@/lib/sim/names";
import { buildBook, buildCandles } from "@/lib/sim/orderbook";
import { dcf, estimateInputs } from "@/lib/quant/dcf";
import { maxBuyForCredits } from "@/lib/sim/lmsr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything one market needs for a trading terminal, in a single call. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  const w = await engine.ensureLoaded();
  const a = w.artists.get(id);
  if (!a) return NextResponse.json({ error: "no such artist" }, { status: 404 });

  const [stored, trades, profile] = await Promise.all([
    prisma.pricePoint.findMany({
      where: { artistId: id },
      orderBy: { tMs: "asc" },
      take: 900,
      select: { tMs: true, price: true },
    }),
    prisma.trade.findMany({
      where: { artistId: id },
      orderBy: { id: "desc" },
      take: 60,
      select: {
        id: true, side: true, qty: true, priceAfter: true, tMs: true, actor: true,
        bot: { select: { name: true } },
      },
    }),
    prisma.artistProfile.findUnique({
      where: { artistId: id },
      select: { imageUrl: true },
    }),
  ]);

  const ring = w.priceRing.get(id) ?? [];
  const series = [
    ...stored.map((p) => ({ t: p.tMs, p: p.price })),
    ...ring.map((p) => ({ t: p.t, p: p.p })),
  ];
  const candles = buildCandles(
    series,
    trades.map((t) => ({ tMs: t.tMs, qty: t.qty })),
    64,
  );

  const first = candles[0]?.o ?? a.price;
  const high = candles.reduce((m, c) => Math.max(m, c.h), a.price);
  const low = candles.reduce((m, c) => Math.min(m, c.l), a.price);
  const volume = candles.reduce((s, c) => s + c.v, 0);
  const fair = dcf(estimateInputs(a)).pvPerContract;
  const position = w.positions.get(id) ?? { qty: 0, costBasis: 0, realised: 0 };

  return NextResponse.json({
    market: {
      id: a.id,
      name: a.name,
      genre: genreFor(a.name),
      category: categoryOf(a.name),
      tier: a.tier,
      active: a.active,
      price: a.price,
      prevPrice: a.prevPrice,
      change: first > 0 ? a.price / first - 1 : 0,
      high,
      low,
      volume,
      listeners: a.listeners,
      monthlyRoyalty: a.listeners * a.royaltyRate,
      fairValue: fair,
      divergence: fair > 0 ? a.price / fair - 1 : 0,
      b: a.b,
      vMax: a.vMax,
      q: a.q,
      unitScale: a.unitScale,
      avatar: profile?.imageUrl ?? null,
    },
    candles,
    book: buildBook(a.q, a.b, a.vMax),
    trades: trades.map((t) => ({
      id: t.id,
      side: t.side,
      qty: Math.abs(t.qty),
      price: t.priceAfter,
      tMs: t.tMs,
      who: t.actor === "USER" ? "You" : (t.bot?.name ?? "Desk"),
      mine: t.actor === "USER",
    })),
    account: {
      cash: w.account.cash,
      position,
      maxBuy: maxBuyForCredits(a.q, a.b, a.vMax, w.account.cash),
    },
    simMs: w.simMs,
  });
}
