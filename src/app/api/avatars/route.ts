import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { engine } from "@/lib/engine/engine";
import { warmProfiles, warmState } from "@/lib/music/warmer";

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

  const cached = await prisma.artistProfile.findMany({
    select: { artistId: true, imageUrl: true },
  });
  const avatars: Record<number, string> = {};
  for (const c of cached) if (c.imageUrl) avatars[c.artistId] = c.imageUrl;

  // If the background pass is not running and rows are still missing, start it.
  // Covers a reseed, which creates artists the boot-time pass never saw.
  if (!warmState.running && cached.length < w.order.length) {
    void warmProfiles(w.runId).catch(() => {});
  }

  return NextResponse.json({
    avatars,
    configured: true,
    rosterCount: w.order.length,
    resolved: Object.keys(avatars).length,
    pending: Math.max(0, w.order.length - cached.length),
    warming: warmState.running,
    warmDone: warmState.done,
    warmTotal: warmState.total,
    lastName: warmState.lastName,
  });
}
