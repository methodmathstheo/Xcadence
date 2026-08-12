import { NextResponse } from "next/server";
import { engine } from "@/lib/engine/engine";
import { executeTrade, TradeError } from "@/lib/engine/trading";
import { maxBuyForCredits, quoteTrade, lmsrMaxLoss } from "@/lib/sim/lmsr";
import { dcf, estimateInputs } from "@/lib/quant/dcf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pre-trade quote. Everything the ticket needs to show price impact and
 * slippage *before* the user commits — the LMSR cost function is closed-form,
 * so this is the exact fill, not an estimate.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const artistId = Number(url.searchParams.get("artistId"));
  const qty = Number(url.searchParams.get("qty"));

  const w = await engine.ensureLoaded();
  const a = w.artists.get(artistId);
  if (!a) return NextResponse.json({ error: "no such artist" }, { status: 404 });

  const position = w.positions.get(artistId) ?? { qty: 0, costBasis: 0, realised: 0 };
  const fair = dcf(estimateInputs(a)).pvPerContract;

  const body = {
    artist: {
      id: a.id, name: a.name, tier: a.tier, price: a.price,
      b: a.b, vMax: a.vMax, q: a.q, unitScale: a.unitScale,
      listeners: a.listeners, monthlyRoyalty: a.listeners * a.royaltyRate,
    },
    fairValue: fair,
    divergence: fair > 0 ? a.price / fair - 1 : 0,
    cash: w.account.cash,
    position,
    maxBuy: maxBuyForCredits(a.q, a.b, a.vMax, w.account.cash),
    /** Worst case the market maker can lose subsidising this market. */
    subsidy: lmsrMaxLoss(a.b, a.vMax),
    quote: Number.isFinite(qty) && qty !== 0 ? quoteTrade(a.q, a.b, a.vMax, qty) : null,
  };
  return NextResponse.json(body);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const artistId = Number(body?.artistId);
  const qty = Number(body?.qty);

  const w = await engine.ensureLoaded();
  try {
    const fill = executeTrade(w, artistId, qty, { kind: "USER" }, { allowShort: true });
    // Persist immediately: a user trade is not something to lose to a crash in
    // the next five seconds of write-behind.
    await engine.flush();
    return NextResponse.json({ fill, cash: w.account.cash });
  } catch (err) {
    if (err instanceof TradeError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
