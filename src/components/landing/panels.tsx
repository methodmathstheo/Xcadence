"use client";

import { useRef } from "react";
import { Avatar } from "@/components/Avatar";
import { RNG } from "@/lib/rng";
import { genreLabel } from "@/lib/music/genre";
import { fmtCompact, fmtCredits, fmtSignedPct } from "@/lib/format";
import { equitySeries, survivalCurves, type Seed } from "@/lib/landing/synthetic";
import { useTicks } from "@/lib/landing/useLive";

const UP = "#3fd39a";
const DOWN = "#f2647c";
const ACCENT = "#8f84d3";
const NEUTRAL = "#7ea8e0";

/** Shell every panel sits in, so the whole page reads as one set of screens. */
export function Screen({
  title,
  meta,
  children,
  className = "",
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-line-2/60 bg-panel shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9)] ${className}`}
    >
      <div className="flex items-center justify-between border-b border-line bg-ink/60 px-3 py-2">
        <span className="label text-[9px]">{title}</span>
        {meta && <span className="num text-[10px] text-fg-mute">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- rankings

/** The ranked board: every listing, ordered, with quotes moving in place. */
export function MockRankings({ board }: { board: Seed[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const ticks = useTicks(ref, board, 515);
  const rows = [...ticks]
    .sort((a, b) => b.listeners - a.listeners)
    .slice(0, 7);

  return (
    <div ref={ref}>
      <Screen title="Rankings" meta="by monthly listeners">
        <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
          {["Listeners", "Growth", "Rap", "R&B"].map((f, i) => (
            <span
              key={f}
              className={`label border px-1.5 py-px text-[9px] ${
                i === 0
                  ? "border-accent/50 text-accent"
                  : "border-line text-fg-mute"
              }`}
            >
              {f}
            </span>
          ))}
        </div>

        <div className="divide-y divide-line">
          {rows.map((t, i) => {
            const change = t.prev > 0 ? t.price / t.prev - 1 : 0;
            return (
              <div key={t.id} className="flex items-center gap-2.5 px-3 py-[6px]">
                <span className="num w-4 shrink-0 text-[10px] text-fg-mute">{i + 1}</span>
                <Avatar name={t.name} src={t.image} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-fg-dim">{t.name}</span>
                  {t.genre && (
                    <span className="label block truncate text-[8px] leading-tight">
                      {genreLabel(t.genre)}
                    </span>
                  )}
                </span>
                <span className="num hidden shrink-0 text-[10px] text-fg-mute sm:inline">
                  {fmtCompact(t.listeners)}
                </span>
                <span
                  key={`${t.id}-${t.price}`}
                  className={`num w-16 shrink-0 text-right text-[11px] ${
                    t.dir > 0 ? "flash-up" : t.dir < 0 ? "flash-down" : ""
                  }`}
                  style={{ color: change >= 0 ? UP : DOWN }}
                >
                  {fmtCredits(t.price)}
                </span>
              </div>
            );
          })}
        </div>
      </Screen>
    </div>
  );
}

// --------------------------------------------------------------- portfolio

/** A book against its benchmark, plus the mean-variance read on it. */
export function MockEquity() {
  const series = equitySeries(64);
  const W = 560;
  const H = 180;
  const all = series.flatMap((p) => [p.book, p.index]);
  const top = Math.max(...all) * 1.04;
  const bot = Math.min(...all) * 0.97;
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => H - ((v - bot) / (top - bot)) * H;

  const path = (key: "book" | "index") =>
    series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");

  const last = series[series.length - 1];

  return (
    <Screen title="Portfolio" meta="book vs equal-weighted index">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[172px] w-full">
        <defs>
          <linearGradient id="bookFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            x2={W}
            y1={H * f}
            y2={H * f}
            stroke="#2e3348"
            strokeWidth={1}
          />
        ))}
        <path d={`${path("book")} L${W} ${H} L0 ${H} Z`} fill="url(#bookFill)" />
        <path d={path("index")} fill="none" stroke={NEUTRAL} strokeWidth={1.4} strokeDasharray="4 3" />
        <path d={path("book")} fill="none" stroke={ACCENT} strokeWidth={1.8} />
        <circle cx={x(series.length - 1)} cy={y(last.book)} r={3} fill={ACCENT} />
      </svg>

      <div className="grid grid-cols-4 gap-px border-t border-line bg-line">
        {[
          ["Equity", fmtCredits(last.book * 1000)],
          ["vs index", fmtSignedPct(last.book / last.index - 1, 1)],
          ["Beta", "1.34"],
          ["Appraisal", "0.61"],
        ].map(([k, v]) => (
          <div key={k} className="bg-panel px-2.5 py-1.5">
            <div className="label text-[9px]">{k}</div>
            <div className="num text-[11px] text-fg">{v}</div>
          </div>
        ))}
      </div>
    </Screen>
  );
}

// ---------------------------------------------------------- primary market

/**
 * A royalty slice on offer, with the payments it has made so far.
 *
 * The artist, photograph and genre come from the active run; the cash flows
 * are a seeded illustration of the shape these take, which is the point being
 * made — most slices settle below cost and a few pay off enormously.
 */
export function MockOffering({ artist }: { artist: Seed | null }) {
  const rng = new RNG(8812);
  const months = Array.from({ length: 18 }, () =>
    rng.next() < 0.17 ? rng.uniform(0, 40) : rng.uniform(60, 240),
  );
  const max = Math.max(...months);

  return (
    <Screen title="Offerings" meta="primary market">
      <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
        <Avatar name={artist?.name ?? "Offering"} src={artist?.image} size={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] text-fg">
            {artist?.name ?? "Gilded Harbour"}
          </div>
          <div className="label mt-0.5 truncate text-[9px]">
            {artist?.genre ? `${genreLabel(artist.genre)} · ` : ""}4.5% of royalties ·
            60-month term
          </div>
        </div>
        <span className="label shrink-0 border border-accent/50 px-1.5 py-px text-[9px] text-accent">
          Open
        </span>
      </div>

      <div className="grid grid-cols-3 gap-px bg-line">
        {[
          ["Ask", "18,400"],
          ["Received", "2,961"],
          ["IRR", "−14.2%"],
        ].map(([k, v], i) => (
          <div key={k} className="bg-panel px-2.5 py-1.5">
            <div className="label text-[9px]">{k}</div>
            <div
              className="num text-[11px]"
              style={{ color: i === 2 ? DOWN : "var(--color-fg)" }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-line px-3 py-2.5">
        <div className="label mb-1.5 text-[9px]">Monthly settlement</div>
        <div className="flex h-12 items-end gap-[3px]">
          {months.map((m, i) => (
            <span
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: `${Math.max(6, (m / max) * 100)}%`,
                background: m < 50 ? `${DOWN}99` : `${ACCENT}cc`,
              }}
            />
          ))}
        </div>
        <div className="label mt-2 text-[9px] leading-relaxed">
          Median slice returns far less than the mean
        </div>
      </div>
    </Screen>
  );
}

// --------------------------------------------------------------- quant lab

/** Kaplan-Meier survival by debut tier, with confidence bands. */
export function MockSurvival() {
  const { established, emerging } = survivalCurves(42);
  const W = 560;
  const H = 190;
  const x = (t: number) => (t / 41) * W;
  const y = (s: number) => H - s * H * 0.94 - 6;

  // Stepped, because survival is a step function and smoothing it would draw
  // a curve that claims deaths happened between the months they were observed.
  const step = (c: typeof established) =>
    c
      .map((p, i) => (i === 0 ? `M${x(p.t)} ${y(p.s)}` : `H${x(p.t)} V${y(p.s)}`))
      .join(" ");

  const band = (c: typeof established) =>
    `${c.map((p, i) => `${i ? "L" : "M"}${x(p.t)} ${y(p.hi)}`).join(" ")} ${[...c]
      .reverse()
      .map((p) => `L${x(p.t)} ${y(p.lo)}`)
      .join(" ")} Z`;

  return (
    <Screen title="Quant lab" meta="Kaplan-Meier, by debut tier">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[180px] w-full">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={0} x2={W} y1={y(f)} y2={y(f)} stroke="#2e3348" strokeWidth={1} />
        ))}
        <path d={band(established)} fill={NEUTRAL} opacity={0.14} />
        <path d={band(emerging)} fill={DOWN} opacity={0.14} />
        <path d={step(established)} fill="none" stroke={NEUTRAL} strokeWidth={1.8} />
        <path d={step(emerging)} fill="none" stroke={DOWN} strokeWidth={1.8} />
      </svg>

      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-3 py-2">
        {[
          ["Established debut", NEUTRAL, `${(established[41].s * 100).toFixed(0)}% at 42m`],
          ["Emerging debut", DOWN, `${(emerging[41].s * 100).toFixed(0)}% at 42m`],
        ].map(([label, colour, stat]) => (
          <span key={label as string} className="flex items-center gap-1.5">
            <span className="h-[2px] w-4" style={{ background: colour as string }} />
            <span className="label text-[9px]">{label}</span>
            <span className="num text-[10px] text-fg-dim">{stat}</span>
          </span>
        ))}
      </div>
    </Screen>
  );
}

// ------------------------------------------------------------------- clock

/** The clock, which is the thing that makes this a venue rather than a chart. */
export function MockClock() {
  const speeds = [
    ["1×", "real time"],
    ["60×", "an hour a minute"],
    ["1440×", "a day a minute"],
    ["43200×", "a month a minute"],
  ];
  return (
    <Screen title="Market clock" meta="14 Mar 2029">
      <div className="divide-y divide-line">
        {speeds.map(([s, d], i) => (
          <div
            key={s}
            className={`flex items-center justify-between px-3 py-2 ${
              i === 2 ? "bg-accent/10" : ""
            }`}
          >
            <span
              className="num text-[12px]"
              style={{ color: i === 2 ? ACCENT : "var(--color-fg-dim)" }}
            >
              {s}
            </span>
            <span className="label text-[9px]">{d}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-line px-3 py-2">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full" style={{ background: UP }} />
        <span className="label text-[9px]">Running · state survives a restart</span>
      </div>
    </Screen>
  );
}
