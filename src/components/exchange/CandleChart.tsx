"use client";

import { useMemo, useState } from "react";
import { fmtCredits, fmtCompact } from "@/lib/format";
import { fmtSimDate } from "@/lib/sim/time";
import type { Candle } from "@/lib/sim/orderbook";

/**
 * Candlesticks, drawn directly in SVG.
 *
 * Recharts has no candle primitive and bending a Bar into one costs more code
 * than drawing the rects outright — and this way the wick, body, volume pane
 * and crosshair all share one coordinate system instead of three.
 */
export function CandleChart({
  candles,
  height = 380,
  up = "#26a69a",
  down = "#ef5350",
}: {
  candles: Candle[];
  height?: number;
  up?: string;
  down?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 1000;
  const volH = Math.round(height * 0.18);
  const priceH = height - volH - 26;
  const padR = 66;
  const plotW = W - padR;

  const geom = useMemo(() => {
    if (candles.length === 0) return null;
    const hi = Math.max(...candles.map((c) => c.h));
    const lo = Math.min(...candles.map((c) => c.l));
    const pad = (hi - lo) * 0.08 || hi * 0.05 || 1;
    const top = hi + pad;
    const bot = Math.max(0, lo - pad);
    const maxV = Math.max(1, ...candles.map((c) => c.v));
    const step = plotW / candles.length;
    const bodyW = Math.max(1.5, Math.min(11, step * 0.62));
    const y = (p: number) => ((top - p) / (top - bot || 1)) * priceH;
    return { hi, lo, top, bot, maxV, step, bodyW, y };
  }, [candles, plotW, priceH]);

  if (!geom || candles.length === 0) {
    return (
      <div style={{ height }} className="label flex items-center justify-center">
        No price history yet
      </div>
    );
  }

  const { top, bot, maxV, step, bodyW, y } = geom;
  const ticks = 5;
  const active = hover !== null ? candles[hover] : candles[candles.length - 1];

  return (
    <div className="relative w-full select-none" style={{ height }}>
      {/* Reading of the hovered (or latest) candle, in the usual place. */}
      <div className="pointer-events-none absolute left-3 top-2 z-10 flex flex-wrap gap-3 text-[11px]">
        {[
          ["O", active.o],
          ["H", active.h],
          ["L", active.l],
          ["C", active.c],
        ].map(([k, v]) => (
          <span key={k as string} className="num">
            <span className="text-fg-mute">{k}</span>{" "}
            <span style={{ color: active.c >= active.o ? up : down }}>
              {fmtCredits(v as number)}
            </span>
          </span>
        ))}
        <span className="num text-fg-mute">{fmtSimDate(active.t)}</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * W;
          const i = Math.floor(x / step);
          setHover(i >= 0 && i < candles.length ? i : null);
        }}
      >
        {/* horizontal grid + price axis */}
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const p = bot + ((top - bot) * i) / ticks;
          const yy = y(p);
          return (
            <g key={i}>
              <line x1={0} x2={plotW} y1={yy} y2={yy} stroke="#1f242d" strokeWidth={1} />
              <text
                x={plotW + 8}
                y={yy + 3.5}
                fill="#808b99"
                fontSize={10}
                fontFamily="var(--font-mono-ui)"
              >
                {fmtCredits(p)}
              </text>
            </g>
          );
        })}

        {/* candles */}
        {candles.map((c, i) => {
          const x = i * step + step / 2;
          const rising = c.c >= c.o;
          const col = rising ? up : down;
          const yO = y(c.o);
          const yC = y(c.c);
          const bodyTop = Math.min(yO, yC);
          const bodyH = Math.max(1, Math.abs(yC - yO));
          return (
            <g key={i} opacity={hover === null || hover === i ? 1 : 0.72}>
              <line
                x1={x}
                x2={x}
                y1={y(c.h)}
                y2={y(c.l)}
                stroke={col}
                strokeWidth={1}
              />
              <rect
                x={x - bodyW / 2}
                y={bodyTop}
                width={bodyW}
                height={bodyH}
                fill={rising ? "none" : col}
                stroke={col}
                strokeWidth={1}
              />
            </g>
          );
        })}

        {/* volume pane */}
        <g transform={`translate(0, ${priceH + 14})`}>
          {candles.map((c, i) => {
            const x = i * step + step / 2;
            const h = (c.v / maxV) * volH;
            return (
              <rect
                key={i}
                x={x - bodyW / 2}
                y={volH - h}
                width={bodyW}
                height={h}
                fill={c.c >= c.o ? up : down}
                opacity={0.42}
              />
            );
          })}
          <text x={plotW + 8} y={10} fill="#808b99" fontSize={9} fontFamily="var(--font-mono-ui)">
            VOL
          </text>
          <text
            x={plotW + 8}
            y={volH}
            fill="#808b99"
            fontSize={9}
            fontFamily="var(--font-mono-ui)"
          >
            {fmtCompact(maxV)}
          </text>
        </g>

        {/* last price marker */}
        <g>
          <line
            x1={0}
            x2={plotW}
            y1={y(candles[candles.length - 1].c)}
            y2={y(candles[candles.length - 1].c)}
            stroke="#f0b429"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
          <rect
            x={plotW + 2}
            y={y(candles[candles.length - 1].c) - 8}
            width={62}
            height={16}
            fill="#f0b429"
          />
          <text
            x={plotW + 6}
            y={y(candles[candles.length - 1].c) + 3.5}
            fill="#07080a"
            fontSize={10}
            fontWeight={600}
            fontFamily="var(--font-mono-ui)"
          >
            {fmtCredits(candles[candles.length - 1].c)}
          </text>
        </g>

        {/* crosshair */}
        {hover !== null && (
          <line
            x1={hover * step + step / 2}
            x2={hover * step + step / 2}
            y1={0}
            y2={priceH}
            stroke="#4b5565"
            strokeDasharray="2 3"
            strokeWidth={1}
          />
        )}
      </svg>
    </div>
  );
}
