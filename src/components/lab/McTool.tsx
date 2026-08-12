"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { axisProps, CHART, tooltipStyle } from "@/components/charts/theme";
import { Panel, Stat } from "@/components/ui";
import { fmtCompact, fmtPct } from "@/lib/format";
import type { McResult } from "@/lib/quant/montecarlo";

export function McTool({
  data,
}: {
  data: { artist: { name: string }; marketCapImplied: number; result: McResult } | null;
}) {
  if (!data) return <div className="label px-3 py-10 text-center">Running paths…</div>;
  const r = data.result;

  // Stack the bands so the fan renders as nested ribbons rather than overlaps.
  const fan = r.fan.map((f) => ({
    month: f.month,
    p10: f.p10,
    b10_25: f.p25 - f.p10,
    b25_50: f.p50 - f.p25,
    b50_75: f.p75 - f.p50,
    b75_90: f.p90 - f.p75,
    p50: f.p50,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-6">
        <Stat label="Mean" value={fmtCompact(r.terminal.mean)} />
        <Stat label="Median" value={fmtCompact(r.terminal.median)} />
        <Stat label="P10" value={fmtCompact(r.terminal.p10)} />
        <Stat label="P90" value={fmtCompact(r.terminal.p90)} />
        <Stat
          label="Total loss"
          value={fmtPct(r.probTotalLoss, 1)}
          tone="text-down"
          sub="artist exits early"
        />
        <Stat
          label="Below cost"
          value={fmtPct(r.probBelowCost, 1)}
          tone="text-down"
          sub="vs implied market cap"
        />
      </div>

      <div className="border border-accent/50 bg-accent/5 px-3 py-2 text-xs leading-relaxed text-accent">
        <span className="label text-accent">Mean − median gap</span> The mean outcome is{" "}
        <span className="num">{fmtPct(r.meanMedianGap, 0)}</span> above the median. The average is
        not the typical result: the best 1% of paths carry{" "}
        <span className="num">{fmtPct(r.top1Share, 0)}</span> of all value generated across{" "}
        {r.paths.toLocaleString()} paths. A valuation quoted as a single expected figure is
        describing an outcome most draws never come close to.
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
        <Panel title="Percentile fan · cumulative discounted royalties">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fan} margin={{ top: 10, right: 14, bottom: 4, left: 4 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="month" tickFormatter={(v) => `${Math.round(v / 12)}y`} {...axisProps} />
                <YAxis width={62} tickFormatter={(v) => fmtCompact(v)} {...axisProps} />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(v) => `month ${v}`}
                  formatter={(v, n) => [fmtCompact(Number(v)), String(n)]}
                />
                <Area dataKey="p10" stackId="f" stroke="none" fill="transparent" />
                <Area dataKey="b10_25" stackId="f" stroke="none" fill={CHART.band} fillOpacity={0.12} name="P10–P25" />
                <Area dataKey="b25_50" stackId="f" stroke="none" fill={CHART.band} fillOpacity={0.24} name="P25–P50" />
                <Area dataKey="b50_75" stackId="f" stroke="none" fill={CHART.band} fillOpacity={0.24} name="P50–P75" />
                <Area dataKey="b75_90" stackId="f" stroke="none" fill={CHART.band} fillOpacity={0.12} name="P75–P90" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Terminal value distribution" right={<span className="label">binned at P99</span>}>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.histogram} margin={{ top: 10, right: 14, bottom: 4, left: 4 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis
                  dataKey="lo"
                  tickFormatter={(v) => fmtCompact(Number(v))}
                  minTickGap={30}
                  {...axisProps}
                />
                <YAxis width={44} {...axisProps} />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(v) => `from ${fmtCompact(Number(v))}`}
                  formatter={(v) => [`${v} paths`, "count"]}
                />
                <ReferenceLine
                  x={r.terminal.median}
                  stroke={CHART.line2}
                  label={{ value: "median", fill: CHART.line2, fontSize: 10, position: "top" }}
                />
                <ReferenceLine
                  x={r.terminal.mean}
                  stroke={CHART.down}
                  label={{ value: "mean", fill: CHART.down, fontSize: 10, position: "top" }}
                />
                <Bar dataKey="count" fill={CHART.violet} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <p className="max-w-4xl text-xs leading-relaxed text-fg-mute">
        {r.paths.toLocaleString()} paths of monthly log-growth with a Pareto jump, against a
        constant monthly hazard of permanent exit. Standard deviation of terminal value is{" "}
        <span className="num">{fmtCompact(r.terminal.sd)}</span> — larger than the median outcome
        itself, which is the practical reason a mean is a poor summary here. Paths use the same
        observable inputs as the DCF tab; neither can see the artist&apos;s real hazard rate.
      </p>
    </div>
  );
}
