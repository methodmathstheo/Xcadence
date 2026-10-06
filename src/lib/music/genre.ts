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

/**
 * Artists whose displayed genre is picked by hand.
 *
 * MusicBrainz orders tags by how many people applied them, which reliably puts
 * the broadest label first — Playboi Carti comes back "hip hop" ahead of
 * "rage", the subgenre he is actually credited with defining. These are a
 * choice *among the tags the sources already attest*, never an invention: the
 * override is ignored unless the artist genuinely carries that tag, so it
 * cannot put a label on someone the data does not support.
 */
const PREFERRED_TAG: Record<string, string> = {
  "Playboi Carti": "rage",
};

/** Primary genre for tables: the most-attested real tag, else the fallback. */
export function primaryGenre(name: string, stored: string | null | undefined): string {
  const real = parseGenres(stored);
  const preferred = PREFERRED_TAG[name];
  if (preferred && real.some((g) => g.toLowerCase() === preferred)) return preferred;
  return real[0] ?? genreFor(name);
}

/** Genre as a label: "rage" reads as "Rage" where it sits beside a name. */
export function genreLabel(genre: string): string {
  return genre.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** True where the genre shown came from a real source. */
export function genreIsReal(stored: string | null | undefined): boolean {
  return parseGenres(stored).length > 0;
}
