/** Shared Recharts styling. Charts here are for reading values, not decoration. */
export const CHART = {
  grid: "#1b1f27",
  axis: "#67707e",
  line: "#4cc4f0",
  line2: "#f0b429",
  up: "#3ddc97",
  down: "#ff5d5d",
  violet: "#a78bfa",
  band: "#4cc4f0",
  accent: "#f0b429",
  cyan: "#4cc4f0",
} as const;

export const axisProps = {
  stroke: CHART.axis,
  tick: { fill: CHART.axis, fontSize: 10, fontFamily: "var(--font-mono-ui)" },
  tickLine: false,
  axisLine: { stroke: CHART.grid },
} as const;

export const tooltipStyle = {
  contentStyle: {
    background: "#0d0f13",
    border: "1px solid #262b35",
    borderRadius: 0,
    fontSize: 11,
    fontFamily: "var(--font-mono-ui)",
  },
  labelStyle: { color: "#98a1b0" },
  itemStyle: { color: "#d8dce4" },
} as const;
