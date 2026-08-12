import {
  ensureHeadroom, lmsrPrice, maxBuyForCredits, quoteTrade, type Quote,
} from "@/lib/sim/lmsr";
import type { ArtistState } from "@/lib/sim/dynamics";
import type { BotState, PositionState, World } from "@/lib/engine/types";
import { pushTape } from "@/lib/engine/tape";

export type Actor = { kind: "USER" } | { kind: "BOT"; bot: BotState };

export interface Fill extends Quote {
  artistId: number;
  actor: string;
  side: "BUY" | "SELL";
  realised: number;
}

export class TradeError extends Error {}

/**
 * Execute against the artist's LMSR market.
 *
 * `qty` is signed: positive buys, negative sells. Both the user and the bots
 * go through this one path, so a bot print and a user print move the quote by
 * exactly the same rule and land on the same tape.
 */
export function executeTrade(
  w: World,
  artistId: number,
  qty: number,
  actor: Actor,
  opts: { allowShort?: boolean; maxSpend?: number } = {},
): Fill {
  const a = w.artists.get(artistId);
  if (!a) throw new TradeError("no such artist");
  if (!a.active) throw new TradeError(`${a.name} is no longer listed`);
  if (!Number.isFinite(qty) || qty === 0) throw new TradeError("size must be non-zero");

  const isUser = actor.kind === "USER";
  const positions = isUser ? w.positions : actor.kind === "BOT" ? actor.bot.positions : null;
  const held = positionOf(positions, artistId);
  const cash = isUser ? w.account.cash : (actor as { bot: BotState }).bot.cash;

  // Short only where allowed, and never past flat by more than the caller asked.
  if (!opts.allowShort && held.qty + qty < -1e-9) {
    qty = -held.qty;
    if (Math.abs(qty) < 1e-9) throw new TradeError("nothing to sell");
  }

  // Make room before quoting. The cap raise is price-preserving, so this is
  // invisible in the fill but stops a market pinning against vMax when
  // fundamentals have run above the cap set at listing.
  const room = ensureHeadroom(a.q, a.b, a.vMax);
  if (room.raised) {
    a.q = room.q;
    a.vMax = room.vMax;
  }

  let quote = quoteTrade(a.q, a.b, a.vMax, qty);

  // A buy can never spend more credits than are available, nor more than the
  // caller's own budget for this clip.
  const budget = Math.min(cash, opts.maxSpend ?? cash);
  if (quote.cost > budget + 1e-9) {
    const affordable = maxBuyForCredits(a.q, a.b, a.vMax, budget);
    if (affordable < 1e-6) throw new TradeError("insufficient credits");
    quote = quoteTrade(a.q, a.b, a.vMax, affordable);
  }

  // ---- apply to the market
  a.q = quote.qAfter;
  a.prevPrice = a.price;
  a.price = lmsrPrice(a.q, a.b, a.vMax);
  w.dirty.add(artistId);
  w.changed.add(artistId);

  const ring = w.priceRing.get(artistId);
  if (ring) {
    ring.push({ t: w.simMs, p: a.price });
    if (ring.length > 720) ring.shift();
  }

  // ---- apply to the trader
  const realised = applyToPosition(positions!, artistId, quote.qty, quote.cost);
  if (isUser) {
    w.account.cash -= quote.cost;
    w.account.realisedPnl += realised;
  } else {
    const bot = (actor as { bot: BotState }).bot;
    bot.cash -= quote.cost;
  }

  const side: "BUY" | "SELL" = quote.qty > 0 ? "BUY" : "SELL";
  const actorName = isUser ? "You" : (actor as { bot: BotState }).bot.name;

  w.pending.trades.push({
    artistId,
    botId: isUser ? null : (actor as { bot: BotState }).bot.id,
    actor: isUser ? "USER" : "BOT",
    side,
    qty: quote.qty,
    cost: quote.cost,
    priceBefore: quote.priceBefore,
    priceAfter: quote.priceAfter,
    tMs: w.simMs,
    realised,
  });

  pushTape(w, {
    id: `t${w.tick}-${artistId}-${w.pending.trades.length}`,
    kind: "trade",
    tMs: w.simMs,
    artistId,
    artistName: a.name,
    text: `${side} ${Math.abs(Math.round(quote.qty))} ${a.name}`,
    side,
    qty: Math.abs(quote.qty),
    price: quote.priceAfter,
    actor: actorName,
  });

  return { ...quote, artistId, actor: actorName, side, realised };
}

function positionOf(
  positions: Map<number, PositionState | { qty: number; costBasis: number }> | null,
  artistId: number,
): { qty: number; costBasis: number } {
  return positions?.get(artistId) ?? { qty: 0, costBasis: 0 };
}

/**
 * Weighted-average cost basis with signed quantities, so a short is just a
 * negative position and closing one realises P&L by the same arithmetic as
 * closing a long. Returns realised P&L for this fill.
 */
export function applyToPosition(
  positions: Map<number, PositionState | { qty: number; costBasis: number }>,
  artistId: number,
  dq: number,
  cost: number,
): number {
  const pos = positions.get(artistId) ?? { qty: 0, costBasis: 0, realised: 0 };
  let realised = 0;

  const opening = pos.qty === 0 || Math.sign(dq) === Math.sign(pos.qty);
  if (opening) {
    pos.qty += dq;
    pos.costBasis += cost;
  } else {
    const closeAbs = Math.min(Math.abs(dq), Math.abs(pos.qty));
    const avgPerUnit = pos.costBasis / pos.qty; // signed/signed → price per unit
    const basisForClosed = avgPerUnit * closeAbs * Math.sign(pos.qty);
    const cashForClosed = cost * (closeAbs / Math.abs(dq));

    realised = -cashForClosed - basisForClosed;
    pos.qty -= closeAbs * Math.sign(pos.qty);
    pos.costBasis -= basisForClosed;

    const leftover = Math.abs(dq) - closeAbs;
    if (leftover > 1e-9) {
      // Traded through flat into the opposite direction.
      const remainderCost = cost - cashForClosed;
      pos.qty += leftover * Math.sign(dq);
      pos.costBasis += remainderCost;
    }
  }

  if (Math.abs(pos.qty) < 1e-9) {
    pos.qty = 0;
    pos.costBasis = 0;
  }
  if ("realised" in pos) (pos as PositionState).realised += realised;
  positions.set(artistId, pos);
  return realised;
}

/** Mark-to-market of one position at the live quote. */
export function markPosition(a: ArtistState, pos: { qty: number; costBasis: number }) {
  const marketValue = pos.qty * a.price;
  return {
    marketValue,
    unrealised: marketValue - pos.costBasis,
    avgPrice: pos.qty !== 0 ? pos.costBasis / pos.qty : 0,
  };
}
