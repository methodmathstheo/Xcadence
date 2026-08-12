export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}

export function fmtCredits(n: number, dp = 2): string {
  return n.toLocaleString("en-GB", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

export function fmtSigned(n: number, dp = 2): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtCredits(Math.abs(n), dp)}`;
}

export function fmtPct(x: number, dp = 1): string {
  return `${(x * 100).toFixed(dp)}%`;
}

export function fmtSignedPct(x: number, dp = 1): string {
  if (!Number.isFinite(x)) return "—";
  return `${x > 0 ? "+" : x < 0 ? "−" : ""}${(Math.abs(x) * 100).toFixed(dp)}%`;
}

/** Compact listener counts: 1.24M, 812k, 4,120. */
export function fmtListeners(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(0)}k`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return fmtInt(n);
}

/** Compact credit amounts for tight columns. */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${sign}${(abs / 1e3).toFixed(1)}k`;
  return `${sign}${fmtCredits(abs, abs >= 100 ? 0 : 2)}`;
}

export function toneClass(x: number): string {
  return x > 0 ? "text-up" : x < 0 ? "text-down" : "text-fg-dim";
}
