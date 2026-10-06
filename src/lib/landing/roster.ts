import { prisma } from "@/lib/db";
import { primaryGenre } from "@/lib/music/genre";

/**
 * The artists shown on the landing page.
 *
 * Read straight from the active run, with photographs and genre tags from the
 * same cache the venue's own tables use — so the shopfront shows the real
 * roster rather than placeholders, and a name on the front page is a name you
 * will find inside.
 *
 * Read-only by design. This never calls `getOrCreateRun`, because that would
 * seed an entire universe on the first public page view; on a database with no
 * run yet it simply returns nothing and the panels fall back to a monogram.
 */
export interface LandingArtist {
  id: number;
  name: string;
  genre: string;
  image: string | null;
  listeners: number;
  price: number;
}

/** The face of the venue. Asked for by name. */
const HERO_NAME = "Playboi Carti";

/** Names on the board, if the run has them. Spans both charts. */
const BOARD_NAMES = [
  "Playboi Carti", "SZA", "Travis Scott", "Doja Cat", "Drake", "Summer Walker",
  "21 Savage", "Brent Faiyaz", "Kendrick Lamar", "Tyla", "Lil Baby", "Giveon",
  "Metro Boomin", "Victoria Monét", "Central Cee", "Jhené Aiko",
];

/** Short-lived process cache: the landing page is the most-hit route here. */
const TTL_MS = 60_000;
let cache: { at: number; value: LandingRoster } | null = null;

export interface LandingRoster {
  hero: LandingArtist | null;
  board: LandingArtist[];
  /** A name for the primary-market card — ideally one with a photograph. */
  offering: LandingArtist | null;
}

export async function landingRoster(): Promise<LandingRoster> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const empty: LandingRoster = { hero: null, board: [], offering: null };

  try {
    const run = await prisma.run.findFirst({
      where: { active: true },
      select: { id: true },
    });
    if (!run) return empty;

    const rows = await prisma.artist.findMany({
      where: { runId: run.id, active: true },
      select: {
        id: true,
        name: true,
        listeners: true,
        price: true,
        profile: { select: { imageUrl: true, genres: true } },
      },
    });
    if (rows.length === 0) return empty;

    const toArtist = (r: (typeof rows)[number]): LandingArtist => ({
      id: r.id,
      name: r.name,
      genre: primaryGenre(r.name, r.profile?.genres),
      image: r.profile?.imageUrl ?? null,
      listeners: r.listeners,
      price: r.price,
    });

    const byName = new Map(rows.map((r) => [r.name, r]));
    const hero = byName.get(HERO_NAME);

    // Preferred names first, then whoever else is biggest — so the board is
    // full even on a run where the warmer has not reached everybody, and the
    // rows that do appear are ones a visitor will recognise.
    const picked: LandingArtist[] = [];
    const seen = new Set<number>();
    for (const name of BOARD_NAMES) {
      const r = byName.get(name);
      if (r && !seen.has(r.id)) {
        seen.add(r.id);
        picked.push(toArtist(r));
      }
    }
    if (picked.length < 8) {
      for (const r of [...rows].sort((a, b) => b.listeners - a.listeners)) {
        if (picked.length >= 12) break;
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        picked.push(toArtist(r));
      }
    }

    const value: LandingRoster = {
      hero: hero ? toArtist(hero) : (picked[0] ?? null),
      board: picked,
      // An emerging name reads truer on a royalty offering than a superstar
      // does, so this takes the smallest of the picked set that still has a
      // photograph to show.
      offering:
        [...picked]
          .filter((a) => a.image)
          .sort((a, b) => a.listeners - b.listeners)[0] ??
        picked[picked.length - 1] ??
        null,
    };

    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.error("[landing] could not read roster", err);
    return empty;
  }
}
