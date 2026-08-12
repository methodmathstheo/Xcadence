"use client";

import { fmtCompact, fmtCredits } from "@/lib/format";
import type { Book } from "@/lib/sim/orderbook";

const UP = "#26a69a";
const DOWN = "#ef5350";

/**
 * Depth ladder in the familiar two-column form.
 *
 * The bars behind each row are cumulative depth, so the shape reads the way a
 * real book does — except that here it is exact rather than a snapshot of
 * whoever happened to be resting an order. There is no queue to jump and no
 * order to cancel: the numbers are the market maker's cost curve.
 */
export function OrderBook({
  book,
  lastPrice,
  onPick,
}: {
  book: Book;
  lastPrice: number;
  onPick?: (price: number) => void;
}) {
  const maxTotal = Math.max(
    ...book.asks.map((l) => l.total),
    ...book.bids.map((l) => l.total),
    1,
  );

  const Row = ({
    level,
    side,
  }: {
    level: { price: number; qty: number; total: number };
    side: "bid" | "ask";
  }) => (
    <button
      onClick={() => onPick?.(level.price)}
      className="relative flex w-full items-center justify-between px-3 py-[3px] text-[11px] hover:bg-white/5"
    >
      <span
        className="absolute inset-y-0 right-0"
        style={{
          width: `${(level.total / maxTotal) * 100}%`,
          background: side === "ask" ? `${DOWN}1f` : `${UP}1f`,
        }}
      />
      <span className="num relative" style={{ color: side === "ask" ? DOWN : UP }}>
        {fmtCredits(level.price)}
      </span>
      <span className="num relative text-fg-dim">{fmtCompact(level.qty)}</span>
      <span className="num relative w-16 text-right text-fg-mute">
        {fmtCompact(level.total)}
      </span>
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-wider text-fg-mute">
        <span>Price</span>
        <span>Size</span>
        <span className="w-16 text-right">Total</span>
      </div>

      <div className="flex flex-col-reverse">
        {book.asks.map((l, i) => (
          <Row key={`a${i}`} level={l} side="ask" />
        ))}
      </div>

      <div className="my-1 flex items-baseline justify-between border-y border-line px-3 py-1.5">
        <span className="num text-base text-fg">{fmtCredits(lastPrice)}</span>
        <span className="label">mid</span>
      </div>

      <div>
        {book.bids.map((l, i) => (
          <Row key={`b${i}`} level={l} side="bid" />
        ))}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-px border-t border-line bg-line text-[11px]">
        <div className="bg-panel px-3 py-1.5">
          <div className="label">Depth −1%</div>
          <div className="num" style={{ color: UP }}>
            {fmtCompact(book.depth1pcDown)}
          </div>
        </div>
        <div className="bg-panel px-3 py-1.5">
          <div className="label">Depth +1%</div>
          <div className="num" style={{ color: DOWN }}>
            {fmtCompact(book.depth1pcUp)}
          </div>
        </div>
      </div>
    </div>
  );
}
