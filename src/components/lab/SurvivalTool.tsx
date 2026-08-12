"use client";

import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { axisProps, CHART, tooltipStyle } from "@/components/charts/theme";
import { Panel } from "@/components/ui";
import { fmtPct } from "@/lib/format";
import type { KmCurve } from "@/lib/quant/survival";

const TIER_COLOR: Record<string, string> = {
  superstar: CHART.violet,
  established: CHART.line,
  emerging: CHART.line2,
  dormant: "#7d8694",
  all: CHART.up,
};

export function SurvivalTool({
  data,
}: {
  data: { curves: KmCurve[]; overall: KmCurve; n: number } | null;
}) {
  if (!data) return <div className="label px-3 py-10 text-center">Fitting curves…</div>;

  // Align every curve onto one month grid so a single chart can carry them.
  const maxMonth = Math.max(
    12,
    ...data.curves.flatMap((c) => c.points.map((p) => p.month)),
  );
  const grid: Record<string, number>[] = [];
  for (let m = 0; m <= maxMonth; m++) {
    const row: Record<string, number> = { month: m };
    for (const c of data.curves) {
      let s = 1;
      for (const p of c.points) {
        if (p.month <= m) s = p.survival;
        else break;
      }
      row[c.group] = s;
    }
    grid.push(row);
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Kaplan-Meier · probability still commercially active"
        right={<span className="label">{data.n} artists, censored at current age</span>}
      >
        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={grid} margin={{ top: 10, right: 16, bottom: 4, left: 4 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={(v) => `${(v / 12).toFixed(0)}y`}
                {...axisProps}
              />
              <YAxis
                width={46}
                domain={[0, 1]}
                tickFormatter={(v) => fmtPct(v, 0)}
                {...axisProps}
              />
              <Tooltip
                {...tooltipStyle}
                labelFormatter={(v) => `${v} months since debut`}
                formatter={(v, n) => [fmtPct(Number(v), 1), String(n)]}
              />
              <Legend
                verticalAlign="top"
                height={22}
                iconType="plainline"
                formatter={(v) => (
                  <span style={{ fontSize: 10, color: "#98a1b0", textTransform: "uppercase" }}>{v}</span>
                )}
              />
              {data.curves.map((c) => (
                <Line
                  key={c.group}
                  dataKey={c.group}
                  stroke={TIER_COLOR[c.group] ?? CHART.line}
                  strokeWidth={1.6}
                  dot={false}
                  type="stepAfter"
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Survival by tier at debut">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-line">
              <th className="label px-3 py-1.5 text-left font-normal">Debut tier</th>
              <th className="label px-3 py-1.5 text-right font-normal">n</th>
              <th className="label px-3 py-1.5 text-right font-normal">Exited</th>
              <th className="label px-3 py-1.5 text-right font-normal">Censored</th>
              {[1, 2, 3, 4, 5].map((y) => (
                <th key={y} className="label px-3 py-1.5 text-right font-normal">
                  {y}y
                </th>
              ))}
              <th className="label px-3 py-1.5 text-right font-normal">Median life</th>
            </tr>
          </thead>
          <tbody>
            {[...data.curves, data.overall].map((c) => (
              <tr key={c.group} className="border-b border-line/50">
                <td className="px-3 py-1" style={{ color: TIER_COLOR[c.group] ?? undefined }}>
                  {c.group}
                </td>
                <td className="num px-3 py-1 text-right">{c.n}</td>
                <td className="num px-3 py-1 text-right text-down">{c.events}</td>
                <td className="num px-3 py-1 text-right text-fg-mute">{c.censored}</td>
                {c.yearly.map((v, i) => (
                  <td key={i} className="num px-3 py-1 text-right">
                    {v === null ? "—" : fmtPct(v, 0)}
                  </td>
                ))}
                <td className="num px-3 py-1 text-right">
                  {c.medianSurvivalMonths === null ? "not reached" : `${c.medianSurvivalMonths}m`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <p className="max-w-4xl text-[11px] leading-relaxed text-fg-mute">
        Fitted on the exits the engine recorded, segmented by the tier an artist debuted in rather
        than the tier they are in now — segmenting on current tier would condition on the outcome
        and flatten every curve. Artists still listed are right-censored at their present age, not
        counted as survivors: a debut from three months ago carries no information about five-year
        survival. A dash means the observation window does not reach that horizon yet; advance the
        clock and it fills in.
      </p>
    </div>
  );
}
