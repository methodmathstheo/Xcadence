import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { engine } from "@/lib/engine/engine";
import { ROSTER } from "@/lib/sim/names";
import { findArtist, getReleases, spotifyConfigured } from "@/lib/spotify/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROSTER_SET = new Set<string>(ROSTER);
/** Roster lookups performed per request, so the cache warms without a burst. */
const WARM_PER_CALL = 6;

/**
 * Avatar map for tables: artistId → photo URL.
 *
 * Reads the cache and, if Spotify is configured, resolves a few more roster
 * artists each time it is called. Warming progressively rather than firing a
 * hundred lookups at once keeps this well inside Spotify's rate limits — the
 * table simply fills in over the first few refreshes.
 *
 * Generated artists are never looked up. They have no profile to find, and
 * searching for them would return whichever unrelated act matched best.
 */
export async function GET() {
  const w = await engine.ensureLoaded();

  const rosterIds: { id: number; name: string }[] = [];
  for (const id of w.order) {
    const a = w.artists.get(id)!;
    if (ROSTER_SET.has(a.name)) rosterIds.push({ id, name: a.name });
  }

  const cached = await prisma.artistProfile.findMany({
    where: { artistId: { in: rosterIds.map((r) => r.id) } },
    select: { artistId: true, imageUrl: true, found: true },
  });
  const have = new Set(cached.map((c) => c.artistId));

  let warmed = 0;
  if (spotifyConfigured()) {
    for (const r of rosterIds) {
      if (have.has(r.id) || warmed >= WARM_PER_CALL) continue;
      const found = await findArtist(r.name);
      const releases = found ? await getReleases(found.spotifyId) : [];
      await prisma.artistProfile.upsert({
        where: { artistId: r.id },
        create: {
          artistId: r.id,
          spotifyId: found?.spotifyId ?? null,
          imageUrl: found?.imageUrl ?? null,
          followers: found?.followers ?? null,
          popularity: found?.popularity ?? null,
          genres: found ? JSON.stringify(found.genres) : null,
          externalUrl: found?.externalUrl ?? null,
          releases: JSON.stringify(releases),
          found: Boolean(found),
        },
        update: {},
      });
      if (found?.imageUrl) cached.push({ artistId: r.id, imageUrl: found.imageUrl, found: true });
      warmed++;
    }
  }

  const avatars: Record<number, string> = {};
  for (const c of cached) if (c.imageUrl) avatars[c.artistId] = c.imageUrl;

  return NextResponse.json({
    avatars,
    configured: spotifyConfigured(),
    rosterCount: rosterIds.length,
    resolved: Object.keys(avatars).length,
    pending: spotifyConfigured()
      ? rosterIds.filter((r) => !have.has(r.id)).length - warmed
      : 0,
  });
}
