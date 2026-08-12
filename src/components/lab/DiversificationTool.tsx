"use client";

import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { axisProps, CHART, tooltipStyle } from "@/components/charts/theme";
import { ArtistLink, Panel, Stat } from "@/components/ui";
import { fmtPct } from "@/lib/format";
import type { DiversificationResult } from "@/lib/quant/cohort";

/** Diverging blue→red scale for the correlation grid. */
function cell(c: number): string {
  const a = Math.min(1, Math.abs(c));
  return c >= 0
    ? `color-mix(in srgb, ${CHART.down} ${Math.round(a * 72)}%, transparent)`
    : `color-mix(in srgb, ${CHART.line} ${Math.round(a * 72)}%, transparent)`;
}

export function DiversificationTool({
  data, error,
}: {
  data: DiversificationResult | null;
  error: string | null;
}) {
  if (error) return <div className="px-3 py-10 text-center text-xs text-down">{error}</div>;
  if (!data) return <div className="label px-3 py-10 text-center">Computing correlations…</div>;

  const n = data.labels.length;
  const floorSd = Math.sqrt(Math.max(0, data.marketFloor));
  const singleSd = Math.sqrt(Math.max(0, data.singleName));
  const last = data.curve[data.curve.length - 1];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-4">
        <Stat label="Names analysed" value={String(n)} sub="holdings, or a universe slice" />
        <Stat label="Mean pairwise ρ" value={data.meanPairwise.toFixed(3)} />
        <Stat label="Single-name σ" value={fmtPct(singleSd, 1)} sub="monthly" />
        <Stat
          label="Irreducible σ"
          value={fmtPct(floorSd, 1)}
          tone="text-accent"
          sub="the floor, at any count"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_3fr]">
        <Panel title="Correlation matrix" bodyClass="overflow-auto p-3">
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: `minmax(72px, auto) repeat(${n}, minmax(16px, 1fr))` }}
          >
            <div />
            {data.labels.map((l) => (
              <div
                key={`h${l.artistId}`}
                title={l.name}
                className="num overflow-hidden text-[9px] text-fg-mute"
                style={{ writingMode: "vertical-rl", height: 62 }}
              >
                {l.name.slice(0, 12)}
              </div>
            ))}
            {data.matrix.map((row, i) => (
              <div key={`r${i}`} className="contents">
                <div className="num truncate pr-1 text-[11px]" title={data.labels[i].name}>
                  <ArtistLink
                    id={data.labels[i].artistId}
                    name={data.labels[i].name.slice(0, 14)}
                    className="text-fg-mute"
                  />
                </div>
                {row.map((c, j) => (
                  <div
                    key={`c${i}-${j}`}
                    title={`${data.labels[i].name} × ${data.labels[j].name}: ${c.toFixed(2)}`}
                    className="aspect-square min-h-[16px]"
                    style={{ background: i === j ? CHART.grid : cell(c) }}
                  />
                ))}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-fg-mute">
            Red is positive correlation, blue negative. Monthly contract returns.
          </p>
        </Panel>

        <Panel title="Portfolio variance against holding count">
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.curve} margin={{ top: 10, right: 16, bottom: 4, left: 4 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="holdings" {...axisProps} />
                <YAxis width={54} tickFormatter={(v) => fmtPct(v, 1)} {...axisProps} />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(v) => `${v} holdings`}
                  formatter={(v) => [fmtPct(Number(v), 2), "monthly σ"]}
                />
                <ReferenceLine
                  y={floorSd}
                  stroke={CHART.line2}
                  strokeDasharray="3 3"
                  label={{
                    value: "market-risk floor",
                    fill: CHART.line2,
                    fontSize: 10,
                    position: "insideBottomRight",
                  }}
                />
                <Line
                  dataKey="sd"
                  stroke={CHART.up}
                  strokeWidth={1.6}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <p className="max-w-4xl text-xs leading-relaxed text-fg-mute">
        An equally weighted book of k names has variance{" "}
        <span className="num text-fg-dim">v/k + (1 − 1/k)·ρ·v</span>. The first term is
        idiosyncratic and disappears as you add names; the second does not, because every artist
        in this venue is exposed to the same order flow and the same index. Going from one name to{" "}
        {last?.holdings} takes monthly volatility from {fmtPct(singleSd, 1)} to{" "}
        {fmtPct(last?.sd ?? 0, 1)}, and no number of holdings takes it below{" "}
        {fmtPct(floorSd, 1)}. Note also what diversification does not fix: in a right-skewed market
        the median portfolio still underperforms the mean, because spreading capital evenly makes
        it more likely you hold the one name that carries the cohort — and less likely it matters
        much when you do.
      </p>
    </div>
  );
}
