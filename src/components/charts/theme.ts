/** Shared Recharts styling. Charts here are for reading values, not decoration. */
export const CHART = {
  grid: "#2e3348",
  axis: "#7f8499",
  line: "#8f84d3",   /* Accent — primary series */
  line2: "#7ea8e0",  /* cool secondary, distinguishable at 1px */
  up: "#3fd39a",
  down: "#f2647c",
  violet: "#b3a9e8",
  band: "#7ea8e0",
  accent: "#8f84d3",
  cyan: "#7ea8e0",
} as const;

export const axisProps = {
  stroke: CHART.axis,
  tick: { fill: CHART.axis, fontSize: 10, fontFamily: "var(--font-mono-ui)" },
  tickLine: false,
  axisLine: { stroke: CHART.grid },
} as const;

export const tooltipStyle = {
  contentStyle: {
    background: "#1d2031",
    border: "1px solid #3d4359",
    borderRadius: 0,
    fontSize: 11,
    fontFamily: "var(--font-mono-ui)",
  },
  labelStyle: { color: "#b3b6c8" },
  itemStyle: { color: "#e9e9ed" },
} as const;
