"use client";

import { useRef } from "react";
import { LogoMark } from "@/components/Logo";
import { fmtCompact, fmtCredits, fmtSignedPct } from "@/lib/format";
import { book } from "@/lib/landing/synthetic";
import { useCandles, useSimDate, useTicks } from "@/lib/landing/useLive";

const UP = "#3fd39a";
const DOWN = "#f2647c";
const ACCENT = "#8f84d3";

/**
 * The hero: a working exchange terminal, not a screenshot of one.
 *
 * Everything here is drawn with the same tokens, type and chart idioms as the
 * real venue, so what the page promises and what you get after signing in are
 * the same object. A static image would have been less work and would have
 * gone stale the first time the product moved.
 */
export function MockTerminal() {
  const frame = useRef<HTMLDivElement>(null);
  const candles = useCandles(frame, 56);
  const ticks = useTicks(frame);
  const simDate = useSimDate(frame);

  const last = candles[candles.length - 1];
  const first = candles[0];
  const change = first.o > 0 ? last.c / first.o - 1 : 0;
  const depth = book(last.c);

  return (
    <div ref={frame} className="relative">
      {/* Accent bloom behind the glass. Pure decoration, and the only
          gradient on the page — it reads as a screen emitting light. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-8 -inset-y-10 -z-10 opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 55% at 50% 42%, rgba(143,132,211,0.30), transparent 70%)",
        }}
      />

      <div className="overflow-hidden rounded-xl border border-line-2/70 bg-panel shadow-[0_28px_80px_-28px_rgba(0,0,0,0.85)]">
        {/* ------------------------------------------------------ chrome */}
        <div className="flex items-center gap-3 border-b border-line bg-ink/70 px-3 py-2">
          <LogoMark height={13} />
          <span className="num text-[11px] text-fg-dim">AURA</span>
          <span className="num text-[11px]" style={{ color: change >= 0 ? UP : DOWN }}>
            {fmtCredits(last.c)}
          </span>
          <span className="num hidden text-[11px] sm:inline" style={{ color: change >= 0 ? UP : DOWN }}>
            {fmtSignedPct(change, 2)}
          </span>

          <span className="ml-auto flex items-center gap-2.5">
            <span className="num hidden text-[10px] text-fg-mute md:inline">{simDate}</span>
            <span className="label hidden border border-line-2 px-1.5 py-px text-[9px] md:inline">
              43200×
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="pulse-dot inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: UP }}
              />
              <span className="label text-[9px]">Live</span>
            </span>
          </span>
        </div>

        {/* ------------------------------------------- chart + depth book */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_168px]">
          <Candles candles={candles} />

          <div className="hidden flex-col border-l border-line sm:flex">
            <div className="flex items-center justify-between px-2.5 py-1.5">
              <span className="label text-[9px]">Price</span>
              <span className="label text-[9px]">Size</span>
            </div>
            <div className="flex flex-col-reverse">
              {depth.asks.map((l, i) => (
                <Level key={`a${i}`} level={l} tone={DOWN} max={depth.asks[depth.asks.length - 1].total} />
              ))}
            </div>
            <div className="my-0.5 flex items-baseline justify-between border-y border-line px-2.5 py-1">
              <span className="num text-xs text-fg">{fmtCredits(last.c)}</span>
              <span className="label text-[9px]">mid</span>
            </div>
            <div>
              {depth.bids.map((l, i) => (
                <Level key={`b${i}`} level={l} tone={UP} max={depth.bids[depth.bids.length - 1].total} />
              ))}
            </div>
          </div>
        </div>

        {/* --------------------------------------------------- the tape */}
        <div className="grid grid-cols-2 gap-px border-t border-line bg-line md:grid-cols-4">
          {ticks.slice(0, 4).map((t) => (
            <div key={t.sym} className="bg-panel px-2.5 py-1.5">
              <div className="flex items-baseline justify-between">
                <span className="num text-[10px] text-fg-dim">{t.sym}</span>
                <span
                  className={`num text-[11px] ${t.dir > 0 ? "flash-up" : t.dir < 0 ? "flash-down" : ""}`}
                  style={{ color: t.dir >= 0 ? UP : DOWN }}
                  key={`${t.sym}-${t.price}`}
                >
                  {fmtCredits(t.price)}
                </span>
              </div>
              <div className="label mt-0.5 text-[9px]">
                {fmtCompact(t.listeners)} listeners
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Level({
  level,
  tone,
  max,
}: {
  level: { price: number; qty: number; total: number };
  tone: string;
  max: number;
}) {
  return (
    <div className="relative flex items-center justify-between px-2.5 py-[2px] text-[10px]">
      <span
        aria-hidden
        className="absolute inset-y-0 right-0"
        style={{ width: `${(level.total / max) * 100}%`, background: `${tone}1c` }}
      />
      <span className="num relative" style={{ color: tone }}>
        {fmtCredits(level.price)}
      </span>
      <span className="num relative text-fg-mute">{fmtCompact(level.qty)}</span>
    </div>
  );
}

/**
 * Candlesticks in plain SVG, with the axis in HTML on top.
 *
 * The plot is stretched to the container with `preserveAspectRatio="none"` so
 * it always fills the panel, and that scales x and y by different factors —
 * which would smear any text inside the SVG. So the price ladder and the
 * last-price tag are HTML positioned over it in percentages, where a
 * character stays the shape it was designed as at every width.
 */
function Candles({
  candles,
}: {
  candles: { o: number; h: number; l: number; c: number; v: number }[];
}) {
  const W = 1000;
  const H = 300;
  const volH = 44;
  const priceH = H - volH - 10;

  const hi = Math.max(...candles.map((c) => c.h));
  const lo = Math.min(...candles.map((c) => c.l));
  const pad = (hi - lo) * 0.1 || 1;
  const top = hi + pad;
  const bot = Math.max(0, lo - pad);
  const maxV = Math.max(...candles.map((c) => c.v));
  const step = W / candles.length;
  const bodyW = Math.max(1.5, Math.min(10, step * 0.6));

  /** Fraction of the plot height, measured from the top. */
  const frac = (p: number) => (top - p) / (top - bot || 1);
  const y = (p: number) => frac(p) * priceH;

  const lastClose = candles[candles.length - 1].c;
  const gridlines = [0, 1, 2, 3, 4].map((i) => bot + ((top - bot) * i) / 4);

  return (
    <div className="relative h-[210px] w-full pr-[52px] sm:h-[268px]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        aria-label="Simulated price chart"
      >
        {gridlines.map((p, i) => (
          <line
            key={i}
            x1={0}
            x2={W}
            y1={y(p)}
            y2={y(p)}
            stroke="#2e3348"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {candles.map((c, i) => {
          const x = i * step + step / 2;
          const rising = c.c >= c.o;
          const col = rising ? UP : DOWN;
          const bodyTop = Math.min(y(c.o), y(c.c));
          const bodyH = Math.max(1, Math.abs(y(c.c) - y(c.o)));
          return (
            <g key={i} vectorEffect="non-scaling-stroke">
              <line
                x1={x}
                x2={x}
                y1={y(c.h)}
                y2={y(c.l)}
                stroke={col}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <rect
                x={x - bodyW / 2}
                y={bodyTop}
                width={bodyW}
                height={bodyH}
                fill={rising ? "none" : col}
                stroke={col}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}

        <g transform={`translate(0, ${priceH + 10})`}>
          {candles.map((c, i) => (
            <rect
              key={i}
              x={i * step + step / 2 - bodyW / 2}
              y={volH - (c.v / maxV) * volH}
              width={bodyW}
              height={(c.v / maxV) * volH}
              fill={c.c >= c.o ? UP : DOWN}
              opacity={0.38}
            />
          ))}
        </g>

        <line
          x1={0}
          x2={W}
          y1={y(lastClose)}
          y2={y(lastClose)}
          stroke={ACCENT}
          strokeDasharray="3 3"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Price ladder, in HTML so the figures keep their proportions. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {gridlines.map((p, i) => (
          <span
            key={i}
            className="num absolute right-0 -translate-y-1/2 text-[10px] text-fg-mute"
            style={{ top: `${frac(p) * (priceH / H) * 100}%` }}
          >
            {fmtCredits(p)}
          </span>
        ))}
        <span
          className="num absolute right-0 -translate-y-1/2 px-1 py-[1px] text-[10px] font-semibold text-ink"
          style={{
            top: `${frac(lastClose) * (priceH / H) * 100}%`,
            background: ACCENT,
          }}
        >
          {fmtCredits(lastClose)}
        </span>
      </div>
    </div>
  );
}
