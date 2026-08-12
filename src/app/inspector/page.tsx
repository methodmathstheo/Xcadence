"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { axisProps, CHART, tooltipStyle } from "@/components/charts/theme";
import { ArtistLink, Panel, Stat, TierBadge } from "@/components/ui";
import { fmtCompact, fmtCredits, fmtListeners, fmtPct, fmtSignedPct, toneClass } from "@/lib/format";
import { fmtSimDate } from "@/lib/sim/time";

interface Payload {
  run: {
    seed: number; simMs: number; startMs: number; tick: number; speed: number;
    running: boolean; artists: number; active: number;
  };
  efficiency: {
    meanAbsLogErrorTrue: number; medianAbsLogErrorTrue: number;
    meanAbsLogErrorNaive: number; meanLogBiasTrue: number;
    corrQualityPrice: number; n: number;
  };
  deciles: { decile: number; n: number; meanQuality: number; meanMispricing: number; meanHazardError: number }[];
  bots: { strategy: string; bots: number; equity: number; startCash: number; pnl: number; ret: number; positions: number; gross: number }[];
  artists: {
    id: number; name: string; tier: string; debutTier: string; listeners: number;
    price: number; naiveValue: number; trueValue: number; mispricing: number;
    trueQuality: number; hazardRate: number; hazardAssumed: number; hazardError: number;
    driftMu: number; sigma: number; breakoutP: number; targetListeners: number; stretch: number;
  }[];
}

export default function InspectorPage() {
  const [d, setD] = useState<Payload | null>(null);

  const load = useCallback(() => {
    fetch("/api/inspector").then((r) => r.json()).then(setD).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  if (!d) return <div className="label px-4 py-16 text-center">Reading ground truth…</div>;
  const e = d.efficiency;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4">
      <div className="border border-violet/40 bg-violet/5 px-3 py-2 text-[11px] leading-relaxed text-violet">
        <span className="label text-violet">Ground truth</span> Everything on this page is hidden
        from the rest of the application. The bots price off observable fundamentals and a hazard
        rate inferred from tier — none of them can see <span className="num">trueQuality</span>,{" "}
        <span className="num">hazardRate</span> or <span className="num">driftMu</span>. Any
        systematic gap below is a real inefficiency, not the market being handed the answer.
      </div>

      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-6">
        <Stat label="Seed" value={String(d.run.seed)} sub="run is reproducible from this" />
        <Stat label="Simulated now" value={fmtSimDate(d.run.simMs)} sub={`tick ${d.run.tick.toLocaleString()}`} />
        <Stat label="Artists" value={`${d.run.active} / ${d.run.artists}`} sub="active / ever listed" />
        <Stat
          label="Median |price − truth|"
          value={fmtPct(Math.exp(e.medianAbsLogErrorTrue) - 1, 0)}
          sub="log gap, vs ground truth"
        />
        <Stat
          label="Systematic bias"
          value={fmtSignedPct(Math.exp(e.meanLogBiasTrue) - 1, 1)}
          tone={toneClass(-e.meanLogBiasTrue)}
          sub={e.meanLogBiasTrue > 0 ? "market dear" : "market cheap"}
        />
        <Stat
          label="corr(quality, log price)"
          value={e.corrQualityPrice.toFixed(3)}
          tone={e.corrQualityPrice > 0.2 ? "text-up" : "text-fg"}
          sub={`n = ${e.n}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
        <Panel
          title="Calibration by hidden quality decile"
          right={<span className="label">median mispricing vs ground truth</span>}
        >
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.deciles} margin={{ top: 10, right: 14, bottom: 4, left: 4 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="decile" {...axisProps} />
                <YAxis width={52} tickFormatter={(v) => fmtPct(Number(v), 0)} {...axisProps} />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(v) => `quality decile ${v}`}
                  formatter={(v) => [fmtSignedPct(Number(v), 1), "median mispricing"]}
                />
                <ReferenceLine y={0} stroke={CHART.axis} />
                <Bar dataKey="meanMispricing" isAnimationActive={false}>
                  {d.deciles.map((x, i) => (
                    <Cell key={i} fill={x.meanMispricing > 0 ? CHART.down : CHART.up} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="px-3 pb-2 text-[11px] leading-relaxed text-fg-mute">
            Decile 1 is the lowest hidden quality. Bars above zero mean the market is paying more
            than the artist is genuinely worth. A market that could see the truth would sit flat
            at zero; the shape here is what the tier-based hazard estimate gets wrong, since it
            applies one rate to every artist in a tier while the real rates are drawn individually.
            Medians rather than means — mispricing is a ratio with the same power-law tail as
            everything else here, and one artist trading at 200× truth otherwise carries a whole
            decile.
          </p>
        </Panel>

        <Panel title="Bot P&L by strategy">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-line">
                <th className="label px-3 py-1.5 text-left font-normal">Strategy</th>
                <th className="label px-3 py-1.5 text-right font-normal">Bots</th>
                <th className="label px-3 py-1.5 text-right font-normal">Equity</th>
                <th className="label px-3 py-1.5 text-right font-normal">P&L</th>
                <th className="label px-3 py-1.5 text-right font-normal">Return</th>
                <th className="label px-3 py-1.5 text-right font-normal">Names</th>
              </tr>
            </thead>
            <tbody>
              {d.bots.map((b) => (
                <tr key={b.strategy} className="border-b border-line/50">
                  <td className="px-3 py-1 text-fg">{b.strategy}</td>
                  <td className="num px-3 py-1 text-right text-fg-mute">{b.bots}</td>
                  <td className="num px-3 py-1 text-right">{fmtCompact(b.equity)}</td>
                  <td className={`num px-3 py-1 text-right ${toneClass(b.pnl)}`}>
                    {fmtCompact(b.pnl)}
                  </td>
                  <td className={`num px-3 py-1 text-right ${toneClass(b.ret)}`}>
                    {fmtSignedPct(b.ret, 1)}
                  </td>
                  <td className="num px-3 py-1 text-right text-fg-mute">{b.positions}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] leading-relaxed text-fg-mute">
            If the fundamental bots are not ahead of the noise bots over a long run, the market is
            not rewarding information — which is itself a finding about how much signal the public
            valuation carries.
          </p>
        </Panel>
      </div>

      <Panel
        title="Artists · widest gap between price and truth"
        right={<span className="label">hidden parameters exposed</span>}
        bodyClass="max-h-[560px] overflow-auto"
      >
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-panel">
            <tr className="border-b border-line">
              <Th>Artist</Th>
              <Th>Tier</Th>
              <Th right>Listeners</Th>
              <Th right>Price</Th>
              <Th right>Naive value</Th>
              <Th right>True value</Th>
              <Th right>Mispricing</Th>
              <Th right>Quality</Th>
              <Th right>Hazard (real)</Th>
              <Th right>Hazard (assumed)</Th>
              <Th right>Error</Th>
              <Th right>Stretch</Th>
            </tr>
          </thead>
          <tbody>
            {d.artists.map((a) => (
              <tr key={a.id} className="border-b border-line/50 hover:bg-panel-2">
                <td className="max-w-0 truncate px-2 py-1">
                  <ArtistLink id={a.id} name={a.name} />
                </td>
                <td className="px-2 py-1"><TierBadge tier={a.tier} /></td>
                <td className="num px-2 py-1 text-right">{fmtListeners(a.listeners)}</td>
                <td className="num px-2 py-1 text-right text-fg">{fmtCredits(a.price)}</td>
                <td className="num px-2 py-1 text-right text-fg-mute">{fmtCredits(a.naiveValue)}</td>
                <td className="num px-2 py-1 text-right text-violet">{fmtCredits(a.trueValue)}</td>
                <td className={`num px-2 py-1 text-right ${toneClass(-a.mispricing)}`}>
                  {fmtSignedPct(a.mispricing, 0)}
                </td>
                <td className="num px-2 py-1 text-right text-violet">{a.trueQuality.toFixed(3)}</td>
                <td className="num px-2 py-1 text-right text-violet">{fmtPct(a.hazardRate, 2)}</td>
                <td className="num px-2 py-1 text-right text-fg-mute">{fmtPct(a.hazardAssumed, 2)}</td>
                <td className={`num px-2 py-1 text-right ${toneClass(a.hazardError)}`}>
                  {fmtSignedPct(a.hazardError, 2)}
                </td>
                <td className={`num px-2 py-1 text-right ${a.stretch > 1.5 ? "text-down" : "text-fg-mute"}`}>
                  {a.stretch.toFixed(2)}×
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <p className="max-w-4xl text-[11px] leading-relaxed text-fg-mute">
        <span className="text-fg-dim">Stretch</span> is current listeners divided by the level the
        artist&apos;s hidden quality supports. Above 1 means they are running ahead of themselves
        and mean reversion is working against them; the market cannot see this and will often be
        paying for the current level as though it were permanent.{" "}
        <span className="text-fg-dim">Hazard error</span> is the tier-based estimate minus the real
        rate: positive means the market over-estimates the chance this artist disappears and is
        therefore too pessimistic, negative means the opposite.
      </p>
    </div>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`label px-2 py-1.5 font-normal ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
