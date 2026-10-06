"use client";

import { useRef } from "react";
import { fmtCredits, fmtPct } from "@/lib/format";
import { useTicks } from "@/lib/landing/useLive";

/**
 * A scrolling tape across the full width.
 *
 * The one element that says "exchange" before a word has been read. The row is
 * rendered twice and translated by exactly -50% so the loop is seamless; the
 * copy is aria-hidden so a screen reader hears the listings once.
 */
export function TickerStrip({ speed = 64 }: { speed?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const ticks = useTicks(ref, 31337);

  const row = ticks.map((t) => {
    const change = t.prev > 0 ? t.price / t.prev - 1 : 0;
    return (
      <span key={t.sym} className="flex shrink-0 items-baseline gap-2 px-4">
        <span className="num text-[11px] tracking-wide text-fg-dim">{t.sym}</span>
        <span className="num text-[11px] text-fg">{fmtCredits(t.price)}</span>
        <span
          className="num text-[10px]"
          style={{ color: change >= 0 ? "#3fd39a" : "#f2647c" }}
        >
          {change >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(change), 2)}
        </span>
      </span>
    );
  });

  return (
    <div
      ref={ref}
      className="relative flex overflow-hidden border-y border-line bg-panel/60 py-2"
    >
      <div
        className="marquee flex shrink-0 items-center"
        style={{ animationDuration: `${speed}s` }}
      >
        <span className="flex shrink-0 items-center">{row}</span>
        <span aria-hidden className="flex shrink-0 items-center">
          {row}
        </span>
      </div>

      {/* Feathered ends, so the tape runs off the page rather than stopping at
          a hard edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-16"
        style={{ background: "linear-gradient(90deg, var(--color-ink), transparent)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-16"
        style={{ background: "linear-gradient(270deg, var(--color-ink), transparent)" }}
      />
    </div>
  );
}
