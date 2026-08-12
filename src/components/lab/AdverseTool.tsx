"use client";

import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { axisProps, CHART, tooltipStyle } from "@/components/charts/theme";
import { Panel, Stat } from "@/components/ui";
import { Slider } from "@/components/lab/ArtistPicker";
import { fmtPct, fmtSignedPct, toneClass } from "@/lib/format";
import type { AdverseResult } from "@/lib/quant/adverse";

export function AdverseTool({
  data, advantage, onAdvantage, price, onPrice,
}: {
  data: AdverseResult | null;
  advantage: number;
  onAdvantage: (v: number) => void;
  price: number;
  onPrice: (v: number) => void;
}) {
  if (!data) return <div className="label px-3 py-10 text-center">Simulating…</div>;
  const c = data.current;
  const losing = c.priceToValue > 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="panel flex flex-wrap items-center gap-6 px-3 py-2">
        <Slider
          label="Artist information"
          value={advantage}
          min={0}
          max={1}
          step={0.02}
          onChange={onAdvantage}
          format={(v) => fmtPct(v, 0)}
        />
        <Slider
          label="Offer price"
          value={price}
          min={0.1}
          max={2.5}
          step={0.02}
          onChange={onPrice}
          format={(v) => `${v.toFixed(2)}×`}
        />
      </div>

      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-5">
        <Stat label="Accepting" value={String(c.accepted)} sub={`of ${data.universe} artists`} />
        <Stat label="Accept rate" value={fmtPct(c.acceptRate, 0)} />
        <Stat
          label="Pool quality"
          value={c.poolQuality.toFixed(3)}
          tone={c.poolQuality < data.baselineQuality ? "text-down" : "text-up"}
          sub={`universe ${data.baselineQuality.toFixed(3)}`}
        />
        <Stat
          label="Price paid per unit value"
          value={c.priceToValue.toFixed(2)}
          tone={losing ? "text-down" : "text-up"}
          sub={losing ? "buyer overpays" : "buyer underpays"}
        />
        <Stat
          label="Buyer surplus"
          value={fmtSignedPct(c.buyerSurplus / Math.max(1, Math.abs(c.buyerSurplus) + 1), 0)}
          tone={toneClass(c.buyerSurplus)}
          sub={c.buyerSurplus >= 0 ? "positive" : "negative"}
        />
      </div>

      <Panel title="Pool quality and market size against offer price">
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.sweep} margin={{ top: 10, right: 20, bottom: 4, left: 4 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis
                dataKey="price"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v) => `${Number(v).toFixed(1)}×`}
                {...axisProps}
              />
              <YAxis
                yAxisId="q"
                width={50}
                domain={[0, "auto"]}
                tickFormatter={(v) => Number(v).toFixed(2)}
                {...axisProps}
              />
              <YAxis
                yAxisId="n"
                orientation="right"
                width={50}
                {...axisProps}
              />
              <Tooltip
                {...tooltipStyle}
                labelFormatter={(v) => `offer ${Number(v).toFixed(2)}× naive value`}
                formatter={(v, n) => [
                  n === "poolQuality" ? Number(v).toFixed(3) : Math.round(Number(v)).toString(),
                  n === "poolQuality" ? "pool quality" : "artists accepting",
                ]}
              />
              <ReferenceLine
                yAxisId="q"
                y={data.baselineQuality}
                stroke={CHART.grid}
                strokeDasharray="3 3"
                label={{
                  value: "universe average quality",
                  fill: "#67707e",
                  fontSize: 10,
                  position: "insideTopLeft",
                }}
              />
              <ReferenceLine yAxisId="q" x={price} stroke={CHART.line2} />
              <Line
                yAxisId="q"
                dataKey="poolQuality"
                stroke={CHART.violet}
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="n"
                dataKey="accepted"
                stroke={CHART.up}
                strokeWidth={1.4}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="px-3 pb-2 text-[10px] text-fg-mute">
          Violet: mean hidden quality of the artists who accept. Green dashed: how many accept.
        </p>
      </Panel>

      <Panel title="Unravelling · repricing at the accepting pool's average value">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-line">
              <th className="label px-3 py-1.5 text-left font-normal">Round</th>
              <th className="label px-3 py-1.5 text-right font-normal">Offer</th>
              <th className="label px-3 py-1.5 text-right font-normal">Accepting</th>
              <th className="label px-3 py-1.5 text-right font-normal">Pool quality</th>
              <th className="label px-3 py-1.5 text-right font-normal">Paid per unit value</th>
            </tr>
          </thead>
          <tbody>
            {data.unravelling.map((r) => (
              <tr key={r.round} className="border-b border-line/50">
                <td className="num px-3 py-1 text-fg-mute">{r.round}</td>
                <td className="num px-3 py-1 text-right">{r.price.toFixed(3)}×</td>
                <td className="num px-3 py-1 text-right">{r.accepted}</td>
                <td className="num px-3 py-1 text-right">{r.poolQuality.toFixed(3)}</td>
                <td className={`num px-3 py-1 text-right ${r.priceToValue > 1 ? "text-down" : "text-up"}`}>
                  {r.priceToValue.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.collapsed && (
          <p className="border-t border-line px-3 py-2 text-[11px] text-down">
            The market closed. At the price the buyer was willing to pay given who was still
            selling, nobody was willing to sell.
          </p>
        )}
      </Panel>

      <p className="max-w-4xl text-[11px] leading-relaxed text-fg-mute">
        An artist sells when the offer beats what they privately believe their stream is worth.
        Their belief blends the market&apos;s tier-based valuation with the truth, weighted by the
        information slider; at 0% they know no more than the buyer and the pool is unbiased, and
        the curve is flat. As the slider rises the accepting pool&apos;s quality falls below the
        universe average, and it falls further the lower the offer goes — cheap offers are
        accepted only by artists who know they are worth less than they look. Repricing at what
        the last pool turned out to be worth pushes the offer down again, which drives the next
        tranche of better artists out. This tool is one of three surfaces permitted to read hidden
        parameters, because the mechanism does not exist without the seller knowing something the
        buyer does not.
      </p>
    </div>
  );
}
