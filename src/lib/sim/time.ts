/** Simulated-time helpers. All timestamps are ms since epoch (UTC). */

export const MS_HOUR = 3_600_000;
export const MS_DAY = 86_400_000;

/** Speed multipliers offered in the UI. */
export const SPEEDS = [1, 60, 1440, 43200] as const;
export type Speed = (typeof SPEEDS)[number];

export const SPEED_LABELS: Record<number, string> = {
  1: "1× · real time",
  60: "60× · 1 hour / minute",
  1440: "1440× · 1 day / minute",
  43200: "43200× · 1 month / minute",
};

/** Compact month index: yyyy*12 + (month-1). Comparable and differenceable. */
export function monthKey(ms: number): number {
  const d = new Date(ms);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function monthKeyToMs(key: number): number {
  return Date.UTC(Math.floor(key / 12), key % 12, 1);
}

export function monthKeyLabel(key: number): string {
  const d = new Date(monthKeyToMs(key));
  return d.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function addMonths(ms: number, n: number): number {
  const d = new Date(ms);
  return Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth() + n,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
  );
}

export function fmtSimDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtSimDateTime(ms: number): string {
  const d = new Date(ms);
  return `${fmtSimDate(ms)} ${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

export function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(
    d.getUTCSeconds(),
  ).padStart(2, "0")}`;
}
