import { genreFor } from "@/lib/sim/names";

/**
 * Genre display.
 *
 * Real tags come from MusicBrainz, falling back to Wikidata's P136 where the
 * MusicBrainz community has not tagged the artist. Neither source covers
 * everyone, so `genreFor` — a deterministic pick from the artist's own chart's
 * pool — remains the last resort rather than leaving the column blank.
 *
 * That fallback is a label, not a claim, and it is only ever reached when no
 * source has a real answer.
 */
export function parseGenres(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Primary genre for tables: the most-attested real tag, else the fallback. */
export function primaryGenre(name: string, stored: string | null | undefined): string {
  const real = parseGenres(stored);
  return real[0] ?? genreFor(name);
}

/** True where the genre shown came from a real source. */
export function genreIsReal(stored: string | null | undefined): boolean {
  return parseGenres(stored).length > 0;
}
