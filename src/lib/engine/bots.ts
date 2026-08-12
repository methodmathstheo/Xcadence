import type { RNG } from "@/lib/rng";
import { qForPrice } from "@/lib/sim/lmsr";
import { dcf, estimateInputs } from "@/lib/quant/dcf";
import { executeTrade, TradeError } from "@/lib/engine/trading";
import type { BotState, World } from "@/lib/engine/types";

/**
 * Synthetic participants.
 *
 * The market has to move without the user acting, and it has to move for
 * reasons — otherwise the quote is a random walk wearing a costume.
 *
 *   momentum       — extrapolates the recent quote move
 *   meanreversion  — fades it
 *   fundamental    — trades the gap between price and its own DCF
 *   noise          — trades for no reason at all
 *
 * Only the fundamental bots know anything, and even they only know what the
 * artist page knows: observable fundamentals and a hazard rate inferred from
 * tier. None of them can see `trueQuality`. That is why the market can stay
 * wrong, and why the run inspector has something to measure.
 *
 * Sizing note: an earlier version had each bot make one trade against five
 * randomly chosen names per round. Across ~400 listings that touched each
 * market roughly once every four simulated months, so quotes fell steadily
 * further behind fundamentals instead of converging. Fundamental bots now see
 * a shared valuation pass over the whole universe and work the widest gaps.
 */

/** Chance a bot acts on a given round, by strategy. */
const ACT_P: Record<string, number> = {
  fundamental: 0.85,
  momentum: 0.4,
  meanreversion: 0.4,
  noise: 0.35,
};

/** Trades an acting bot may place in one round. */
const CLIPS: Record<string, number> = {
  fundamental: 4,
  momentum: 2,
  meanreversion: 2,
  noise: 2,
};

/** How wide a shortlist the gap-seekers draw from. */
const SHORTLIST = 90;
/** Share of the gap to fair value a fundamental bot closes per trade. */
const FUNDAMENTAL_STEP = 0.35;
/** Cap on one name as a share of the bot's equity. */
const NAME_LIMIT = 0.25;
/** Share of free credits a bot will commit to a single buy. */
const BUY_RESERVE = 0.5;
/**
 * Gap below which a fundamental bot sees nothing worth trading, measured as
 * |ln(fair / price)|. The log matters: a plain fair/price - 1 is unbounded
 * above for an underpriced name but can never go below -1 for an overpriced
 * one, so ranking on it sorted every overvalued artist to the bottom of the
 * shortlist and no bot ever sold one.
 */
const FUNDAMENTAL_BAND = 0.05;

export function runOrderFlow(w: World, rng: RNG): void {
  if (w.order.length === 0) return;

  // Equity, not cash. A bot that has spent its credits on contracts still has
  // capital, and sizing limits off cash alone froze the fundamental bots
  // permanently the moment they got fully invested — including out of selling
  // names they did not already hold.
  const equity = new Map<number, number>();
  for (const bot of w.bots) {
    let e = bot.cash;
    for (const [artistId, p] of bot.positions) {
      const a = w.artists.get(artistId);
      if (a) e += p.qty * a.price;
    }
    equity.set(bot.id, Math.max(bot.cash, e));
  }

  // One valuation pass shared by every fundamental bot this round. Doing it
  // per bot would be eight times the work for identical numbers.
  let ranked: { id: number; fair: number; gap: number }[] | null = null;
  const needFair = w.bots.some(
    (b) => b.strategy === "fundamental" && rng.fork("peek", b.id).bool(ACT_P.fundamental),
  );
  if (needFair) {
    ranked = [];
    for (const id of w.order) {
      const a = w.artists.get(id)!;
      if (!a.active || a.price <= 0) continue;
      const fair = dcf(estimateInputs(a)).pvPerContract;
      if (!Number.isFinite(fair) || fair <= 0) continue;
      const gap = Math.log(fair / a.price);
      if (Math.abs(gap) >= FUNDAMENTAL_BAND) ranked.push({ id, fair, gap });
    }
    ranked.sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap));
    ranked = ranked.slice(0, SHORTLIST);
  }

  for (const bot of w.bots) {
    const r = rng.fork(bot.id);
    if (!r.bool(ACT_P[bot.strategy] ?? 0.3)) continue;

    const clips = CLIPS[bot.strategy] ?? 1;
    for (let c = 0; c < clips; c++) {
      try {
        const cap = equity.get(bot.id) ?? bot.cash;
        const done =
          bot.strategy === "fundamental"
            ? tradeFundamental(w, bot, r.fork("f", c), ranked, cap)
            : tradeTechnical(w, bot, r.fork("t", c), cap);
        if (!done) break;
      } catch (err) {
        if (!(err instanceof TradeError)) throw err;
        // Out of credits, or the name delisted mid-round. Move on.
        break;
      }
    }
  }
}

function tradeFundamental(
  w: World,
  bot: BotState,
  rng: RNG,
  ranked: { id: number; fair: number; gap: number }[] | null,
  capital: number,
): boolean {
  if (!ranked || ranked.length === 0) return false;

  // Several attempts: weighted toward the widest gaps, but a bot already at
  // its limit in the top name must fall through to the next one rather than
  // abandoning the whole round.
  for (let attempt = 0; attempt < 8; attempt++) {
    const idx = Math.min(ranked.length - 1, Math.floor(rng.pareto(1.3, 1) - 1));
    const pick = ranked[idx];
    if (!pick) continue;
    const a = w.artists.get(pick.id);
    if (!a || !a.active) continue;

    const qFair = qForPrice(pick.fair, a.b, a.vMax);
    const qty = (qFair - a.q) * FUNDAMENTAL_STEP * bot.aggression;
    if (place(w, bot, pick.id, qty, capital)) return true;
  }
  return false;
}

function tradeTechnical(w: World, bot: BotState, rng: RNG, capital: number): boolean {
  for (let i = 0; i < 6; i++) {
    const id = w.order[rng.int(0, w.order.length - 1)];
    const a = w.artists.get(id);
    if (!a || !a.active || a.price <= 0) continue;

    const ring = w.priceRing.get(id) ?? [];
    const scale = bot.aggression;
    let qty = 0;

    if (bot.strategy === "momentum") {
      const move = trailingReturn(ring, bot.horizon);
      if (Math.abs(move) < 0.004) continue;
      qty = Math.sign(move) * clip(capital, a.price) * Math.min(1, Math.abs(move) * 12) * scale;
    } else if (bot.strategy === "meanreversion") {
      const move = trailingReturn(ring, Math.max(3, Math.floor(bot.horizon / 2)));
      if (Math.abs(move) < 0.01) continue;
      qty = -Math.sign(move) * clip(capital, a.price) * Math.min(1, Math.abs(move) * 9) * scale;
    } else {
      // Noise. Real venues carry flow that means nothing, and without it the
      // quote only ever moves when something is true.
      qty = (rng.bool() ? 1 : -1) * clip(capital, a.price) * rng.uniform(0.1, 0.6) * scale;
    }

    if (place(w, bot, id, qty, capital)) return true;
  }
  return false;
}

/** Apply the per-name position limit, then send it. */
function place(
  w: World,
  bot: BotState,
  artistId: number,
  qty: number,
  capital: number,
): boolean {
  if (!Number.isFinite(qty) || Math.abs(qty) < 1e-6) return false;
  const a = w.artists.get(artistId)!;

  const held = bot.positions.get(artistId)?.qty ?? 0;
  const maxContracts = (capital * NAME_LIMIT) / Math.max(a.price, 0.01);

  let size = qty;
  if (Math.abs(held + size) > maxContracts) {
    size = Math.sign(size) * Math.max(0, maxContracts - Math.abs(held));
  }
  if (Math.abs(size) < 1e-6) return false;

  executeTrade(w, artistId, size, { kind: "BOT", bot }, {
    allowShort: true,
    // Never sink every last credit into one clip; a bot at exactly zero cash
    // has no room to act on the next thing it sees.
    maxSpend: Math.max(0, bot.cash * BUY_RESERVE),
  });
  return true;
}

function clip(capital: number, price: number): number {
  return (Math.abs(capital) * 0.012) / Math.max(price, 0.01);
}

function trailingReturn(ring: { t: number; p: number }[], lookback: number): number {
  if (ring.length < 2) return 0;
  const last = ring[ring.length - 1].p;
  const past = ring[Math.max(0, ring.length - 1 - lookback)].p;
  if (past <= 0) return 0;
  return last / past - 1;
}
