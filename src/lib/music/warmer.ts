import { prisma } from "@/lib/db";
import { fetchOpenProfile } from "@/lib/music/openmusic";

/**
 * Fills the artist profile cache for the whole roster in the background.
 *
 * MusicBrainz permits one request per second and a profile costs two, so 253
 * artists is roughly nine minutes of wall time. Doing that lazily — a few
 * artists per page load — meant most of the interface showed monogram
 * initials for as long as you kept browsing. This runs the whole pass once at
 * server start instead, slowly and politely, and after it completes the cache
 * holds for thirty days.
 *
 * It never blocks anything: the clock, the market and every page work exactly
 * the same while it is running, and photos appear as rows are filled in.
 */

export interface WarmState {
  running: boolean;
  done: number;
  total: number;
  found: number;
  startedAt: number | null;
  finishedAt: number | null;
  lastName: string | null;
}

const g = globalThis as unknown as { __cadenceWarm?: WarmState };
export const warmState: WarmState = (g.__cadenceWarm ??= {
  running: false,
  done: 0,
  total: 0,
  found: 0,
  startedAt: null,
  finishedAt: null,
  lastName: null,
});

/** Kick off a pass. Safe to call repeatedly; only one runs at a time. */
export async function warmProfiles(runId: number): Promise<void> {
  if (warmState.running) return;

  const artists = await prisma.artist.findMany({
    where: { runId, profile: null },
    select: { id: true, name: true },
    orderBy: { listeners: "desc" },
  });

  const already = await prisma.artistProfile.count();
  if (artists.length === 0) {
    warmState.total = already;
    warmState.done = already;
    warmState.finishedAt = Date.now();
    return;
  }

  warmState.running = true;
  warmState.startedAt = Date.now();
  warmState.finishedAt = null;
  warmState.total = artists.length + already;
  warmState.done = already;

  // Deliberately sequential. fetchOpenProfile serialises through its own
  // one-per-second throttle, so racing these would gain nothing and risk a 503.
  for (const a of artists) {
    try {
      const open = await fetchOpenProfile(a.name);
      await prisma.artistProfile.upsert({
        where: { artistId: a.id },
        create: {
          artistId: a.id,
          mbid: open.mbid,
          bio: open.bio,
          bioUrl: open.bioUrl,
          area: open.area,
          beginYear: open.beginYear,
          imageUrl: open.photoUrl,
          releases: JSON.stringify(open.releases),
          found: open.found,
        },
        update: {},
      });
      if (open.photoUrl) warmState.found++;
      warmState.lastName = a.name;
    } catch {
      // A single failed lookup must not end the pass; that artist keeps its
      // monogram and will be retried when the cache next expires.
    }
    warmState.done++;
  }

  warmState.running = false;
  warmState.finishedAt = Date.now();
}
