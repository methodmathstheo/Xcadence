import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { engine } from "@/lib/engine/engine";
import { fetchOpenProfile } from "@/lib/music/openmusic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lookups performed per request. MusicBrainz allows one call per second and a
 * profile costs two, so three artists is roughly six seconds of work — enough
 * to fill a table over a few refreshes without ever approaching the limit.
 */
const WARM_PER_CALL = 3;

/**
 * Avatar map for tables: artistId → photo URL.
 *
 * Reads the cache and resolves a few more artists on each call. Warming
 * progressively rather than firing 250 lookups at once keeps this inside
 * MusicBrainz's one-per-second limit — the table fills in over a few minutes
 * of browsing and is permanent once cached.
 */
export async function GET() {
  const w = await engine.ensureLoaded();
  const ids = w.order.map((id) => ({ id, name: w.artists.get(id)!.name }));

  const cached = await prisma.artistProfile.findMany({
    where: { artistId: { in: ids.map((r) => r.id) } },
    select: { artistId: true, imageUrl: true, found: true },
  });
  const have = new Set(cached.map((c) => c.artistId));

  let warmed = 0;
  for (const r of ids) {
    if (have.has(r.id) || warmed >= WARM_PER_CALL) continue;
    const open = await fetchOpenProfile(r.name);
    await prisma.artistProfile.upsert({
      where: { artistId: r.id },
      create: {
        artistId: r.id,
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
    if (open.photoUrl) cached.push({ artistId: r.id, imageUrl: open.photoUrl, found: true });
    warmed++;
  }

  const avatars: Record<number, string> = {};
  for (const c of cached) if (c.imageUrl) avatars[c.artistId] = c.imageUrl;

  return NextResponse.json({
    avatars,
    configured: true,
    rosterCount: ids.length,
    resolved: Object.keys(avatars).length,
    pending: ids.filter((r) => !have.has(r.id)).length - warmed,
  });
}
