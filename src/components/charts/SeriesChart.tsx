"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { axisProps, CHART, tooltipStyle } from "@/components/charts/theme";
import { fmtSimDate } from "@/lib/sim/time";

export interface SeriesPoint {
  t: number;
  v: number;
}

/**
 * One series against simulated time. Used for listeners, rank trajectory and
 * price; `reversed` exists because rank 1 belongs at the top.
 */
export function SeriesChart({
  data,
  height = 160,
  color = CHART.line,
  area = false,
  reversed = false,
  format = (v: number) => v.toFixed(2),
  label = "value",
  domain = ["auto", "auto"] as [number | string, number | string],
  logScale = false,
}: {
  data: SeriesPoint[];
  height?: number;
  color?: string;
  area?: boolean;
  reversed?: boolean;
  format?: (v: number) => string;
  label?: string;
  domain?: [number | string, number | string];
  logScale?: boolean;
}) {
  if (data.length === 0) {
    return (
      <div style={{ height }} className="label flex items-center justify-center">
        No data yet
      </div>
    );
  }

  const Chart = area ? AreaChart : LineChart;
  const gradientId = `g-${label.replace(/\W/g, "")}`;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={data} margin={{ top: 8, right: 10, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tickFormatter={(v) => fmtSimDate(v).slice(3)}
            minTickGap={44}
            {...axisProps}
          />
          <YAxis
            width={58}
            reversed={reversed}
            domain={domain}
            scale={logScale ? "log" : "auto"}
            allowDataOverflow={logScale}
            tickFormatter={format}
            {...axisProps}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(v) => fmtSimDate(Number(v))}
            formatter={(v) => [format(Number(v)), label]}
          />
          {area ? (
            <Area
              dataKey="v"
              stroke={color}
              fill={`url(#${gradientId})`}
              strokeWidth={1.4}
              isAnimationActive={false}
              dot={false}
            />
          ) : (
            <Line
              dataKey="v"
              stroke={color}
              strokeWidth={1.4}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}
