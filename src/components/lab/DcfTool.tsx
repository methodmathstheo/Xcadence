"use client";

import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { axisProps, CHART, tooltipStyle } from "@/components/charts/theme";
import { Panel, Stat } from "@/components/ui";
import { Slider } from "@/components/lab/ArtistPicker";
import { fmtCompact, fmtCredits, fmtPct, fmtSignedPct } from "@/lib/format";

export interface DcfPayload {
  artist: { id: number; name: string; tier: string; monthlyRoyalty: number; hazardAssumed: number };
  result: {
    pv: number; perContract: number; impliedMultiple: number; annualRoyalty: number;
    frontLoad: number;
    inputs: { growthAnnual: number; hazardMonthly: number; discountAnnual: number; horizonMonths: number };
    rows: { month: number; expected: number; discounted: number; survival: number; cumulative: number }[];
  };
  sensitivity: { rate: number; pv: number; pvPerContract: number }[];
  halvingRate: number | null;
  marketPrice: number;
  divergence: number;
}

export function DcfTool({
  data, discount, onDiscount,
}: {
  data: DcfPayload | null;
  discount: number;
  onDiscount: (v: number) => void;
}) {
  if (!data) return <div className="label px-3 py-10 text-center">Select an artist</div>;
  const { result, sensitivity, halvingRate } = data;
  const rich = data.divergence > 0.2;
  const cheap = data.divergence < -0.2;
  const baseline = sensitivity[0]?.pv ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="panel px-3 py-2">
        <Slider
          label="Discount rate"
          value={discount}
          min={0.05}
          max={0.3}
          step={0.005}
          onChange={onDiscount}
          format={(v) => fmtPct(v, 1)}
        />
      </div>

      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-5">
        <Stat label="Present value" value={fmtCompact(result.pv)} sub="whole claim" />
        <Stat label="Per contract" value={fmtCredits(result.perContract)} />
        <Stat label="Market price" value={fmtCredits(data.marketPrice)} />
        <Stat
          label="Divergence"
          value={fmtSignedPct(data.divergence, 1)}
          tone={rich ? "text-down" : cheap ? "text-up" : "text-fg"}
          sub={rich ? "market above DCF" : cheap ? "market below DCF" : "in line"}
        />
        <Stat
          label="Implied multiple"
          value={`${result.impliedMultiple.toFixed(1)}×`}
          sub={`on ${fmtCompact(result.annualRoyalty)} / yr`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
        <Panel
          title="Valuation vs discount rate"
          right={
            <span className="label">
              {halvingRate ? `halves at ${fmtPct(halvingRate, 1)}` : "does not halve below 30%"}
            </span>
          }
        >
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sensitivity} margin={{ top: 10, right: 16, bottom: 4, left: 4 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis
                  dataKey="rate"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v) => fmtPct(v, 0)}
                  {...axisProps}
                />
                <YAxis width={62} tickFormatter={(v) => fmtCompact(v)} {...axisProps} />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(v) => `discount ${fmtPct(Number(v), 1)}`}
                  formatter={(v) => [fmtCompact(Number(v)), "present value"]}
                />
                {halvingRate && (
                  <ReferenceLine
                    x={halvingRate}
                    stroke={CHART.down}
                    strokeDasharray="3 3"
                    label={{
                      value: "value halves",
                      fill: CHART.down,
                      fontSize: 10,
                      position: "insideTopRight",
                    }}
                  />
                )}
                <ReferenceLine y={baseline / 2} stroke={CHART.grid} strokeDasharray="2 4" />
                <ReferenceLine
                  x={discount}
                  stroke={CHART.line2}
                  label={{ value: "current", fill: CHART.line2, fontSize: 10, position: "insideTopLeft" }}
                />
                <Line dataKey="pv" stroke={CHART.line} dot={false} strokeWidth={1.6} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Discounted cash flow" bodyClass="max-h-[280px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-line">
                <th className="label px-2 py-1.5 text-left font-normal">Month</th>
                <th className="label px-2 py-1.5 text-right font-normal">Survival</th>
                <th className="label px-2 py-1.5 text-right font-normal">Expected</th>
                <th className="label px-2 py-1.5 text-right font-normal">Discounted</th>
                <th className="label px-2 py-1.5 text-right font-normal">Cumulative</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.month} className="border-b border-line/50">
                  <td className="num px-2 py-1.5 text-fg-mute">{r.month}</td>
                  <td className="num px-2 py-1.5 text-right text-fg-mute">{fmtPct(r.survival, 0)}</td>
                  <td className="num px-2 py-1.5 text-right">{fmtCompact(r.expected)}</td>
                  <td className="num px-2 py-1.5 text-right">{fmtCompact(r.discounted)}</td>
                  <td className="num px-2 py-1.5 text-right text-fg">{fmtCompact(r.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <p className="max-w-4xl text-xs leading-relaxed text-fg-mute">
        Growth is assumed at {fmtSignedPct(result.inputs.growthAnnual)} a year, decaying by half
        every 30 months, against a {fmtPct(result.inputs.hazardMonthly, 2)} monthly probability of
        the artist ceasing to be commercially active — inferred from tier, not from anything
        specific to this artist. {fmtPct(result.frontLoad, 0)} of the present value arrives in the
        first two years, which is why the discount rate matters less here than the hazard rate
        does. A single DCF number also says nothing about dispersion; the Monte Carlo tab is where
        that shows up.
      </p>
    </div>
  );
}
