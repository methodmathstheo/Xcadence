/**
 * Kaplan-Meier survival, run on the exits the engine actually recorded.
 *
 * Artists still listed are right-censored at their current age rather than
 * counted as survivors to infinity — an artist that debuted three months ago
 * tells you nothing about five-year survival, and treating it as a five-year
 * survivor is exactly the bias this app is about.
 */

export interface SurvivalSubject {
  /** Months from debut to exit, or to now if still active. */
  duration: number;
  /** True if the artist exited; false if still listed (censored). */
  event: boolean;
  group: string;
}

export interface KmPoint {
  month: number;
  survival: number;
  atRisk: number;
  events: number;
  /** Greenwood standard error. */
  se: number;
  lower: number;
  upper: number;
}

export interface KmCurve {
  group: string;
  n: number;
  events: number;
  censored: number;
  points: KmPoint[];
  /** Survival at 1..5 years, or null where the data does not reach. */
  yearly: (number | null)[];
  medianSurvivalMonths: number | null;
}

export function kaplanMeier(subjects: SurvivalSubject[], group: string): KmCurve {
  const n = subjects.length;
  const events = subjects.filter((s) => s.event).length;

  // Distinct event times, ascending.
  const times = [...new Set(subjects.filter((s) => s.event).map((s) => Math.floor(s.duration)))]
    .sort((a, b) => a - b);

  const points: KmPoint[] = [{ month: 0, survival: 1, atRisk: n, events: 0, se: 0, lower: 1, upper: 1 }];
  let survival = 1;
  let greenwood = 0;

  for (const t of times) {
    const atRisk = subjects.filter((s) => s.duration >= t).length;
    const d = subjects.filter((s) => s.event && Math.floor(s.duration) === t).length;
    if (atRisk === 0) continue;

    survival *= 1 - d / atRisk;
    greenwood += d / (atRisk * Math.max(1, atRisk - d));
    const se = survival * Math.sqrt(greenwood);
    points.push({
      month: t,
      survival,
      atRisk,
      events: d,
      se,
      lower: Math.max(0, survival - 1.96 * se),
      upper: Math.min(1, survival + 1.96 * se),
    });
  }

  const at = (month: number): number | null => {
    // Only report a horizon the data actually covers.
    const maxObserved = Math.max(...subjects.map((s) => s.duration), 0);
    if (month > maxObserved) return null;
    let s = 1;
    for (const p of points) {
      if (p.month <= month) s = p.survival;
      else break;
    }
    return s;
  };

  const medianPoint = points.find((p) => p.survival <= 0.5);

  return {
    group,
    n,
    events,
    censored: n - events,
    points,
    yearly: [12, 24, 36, 48, 60].map(at),
    medianSurvivalMonths: medianPoint ? medianPoint.month : null,
  };
}

export function kaplanMeierByGroup(subjects: SurvivalSubject[]): KmCurve[] {
  const groups = [...new Set(subjects.map((s) => s.group))];
  return groups
    .map((g) => kaplanMeier(subjects.filter((s) => s.group === g), g))
    .filter((c) => c.n >= 5)
    .sort((a, b) => b.n - a.n);
}
