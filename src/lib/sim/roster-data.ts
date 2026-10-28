/**
 * GENERATED — do not edit by hand. Rebuilt by scripts/build-roster.ts from
 * the harvested artist lists and the public monthly-listener snapshot.
 */
export type Chart = "rap" | "rnb" | "house";

export type RosterEntry = {
  name: string;
  chart: Chart;
  /** Wikipedia article title, only where it differs from the name. */
  wiki?: string;
  /** ISO 3166 country code, where known. */
  country?: string;
  /** Curated subgenre, shown where no source has tagged the artist. */
  genre?: string;
  /** Spotify monthly listeners at the snapshot date. */
  listeners?: number;
};

/** Date of the public monthly-listener snapshot the sizes are anchored to. */
export const LISTENERS_SNAPSHOT = "2026-10-28";

/** Artists added on top of the hand-written roster, in listing order. */
export const ROSTER_EXPANSION: readonly RosterEntry[] = [];

/** Monthly listeners for the hand-written roster, where the snapshot has them. */
export const LISTENERS_BASE: Readonly<Record<string, number>> = {};
