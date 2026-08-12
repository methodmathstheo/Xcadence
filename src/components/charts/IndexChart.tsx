"use client";

import { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMarket } from "@/lib/client/useMarket";
import { axisProps, CHART, tooltipStyle } from "@/components/charts/theme";
import { fmtSimDate } from "@/lib/sim/time";
import { fmtCredits } from "@/lib/format";

type Point = { tMs: number; equal: number; weighted: number };

/**
 * The Emerging Artist Index, both weightings. Persisted month closes give the
 * long shape; live ticks are appended so the right edge keeps moving between
 * simulated month ends.
 */
export function IndexChart({ height = 200 }: { height?: number }) {
  const m = useMarket();
  const [base, setBase] = useState<Point[]>([]);
  const live = useRef<Point[]>([]);
  const [, force] = useState(0);

  useEffect(() => {
    fetch("/api/index")
      .then((r) => r.json())
      .then((d: { points: Point[] }) => setBase(d.points))
      .catch(() => {});
  }, []);

  const t = m.clock.simMs;
  useEffect(() => {
    if (!t) return;
    const arr = live.current;
    const last = arr[arr.length - 1];
    if (last && t - last.tMs < 1) return;
    arr.push({ tMs: t, equal: m.index.equal, weighted: m.index.weighted });
    if (arr.length > 400) arr.shift();
    force((n) => n + 1);
  }, [t, m.index.equal, m.index.weighted]);

  const data = [...base, ...live.current.filter((p) => !base.length || p.tMs > base[base.length - 1].tMs)];

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="tMs"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tickFormatter={(v) => fmtSimDate(v).slice(3)}
            minTickGap={40}
            {...axisProps}
          />
          <YAxis
            domain={["auto", "auto"]}
            width={46}
            tickFormatter={(v) => v.toFixed(0)}
            {...axisProps}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(v) => fmtSimDate(Number(v))}
            formatter={(v, n) => [
              fmtCredits(Number(v)),
              n === "equal" ? "Equal-weighted" : "Listener-weighted",
            ]}
          />
          <Legend
            verticalAlign="top"
            height={20}
            iconType="plainline"
            formatter={(v) => (
              <span style={{ fontSize: 10, color: "#98a1b0" }}>
                {v === "equal" ? "EQUAL-WEIGHTED" : "LISTENER-WEIGHTED"}
              </span>
            )}
          />
          <Line
            dataKey="equal"
            stroke={CHART.line}
            dot={false}
            strokeWidth={1.4}
            isAnimationActive={false}
          />
          <Line
            dataKey="weighted"
            stroke={CHART.line2}
            dot={false}
            strokeWidth={1.4}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
