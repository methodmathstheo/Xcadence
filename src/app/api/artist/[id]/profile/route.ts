import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { engine } from "@/lib/engine/engine";
import { ROSTER } from "@/lib/sim/names";
import { generateReleases } from "@/lib/sim/releases";
import { findArtist, getReleases, spotifyConfigured } from "@/lib/spotify/client";
import { fmtSimDate } from "@/lib/sim/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROSTER_SET = new Set<string>(ROSTER);
/** How long a Spotify lookup stays good before it is refreshed. */
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Artist profile: avatar, an about section built from the run, and releases.
 *
 * Two distinct paths, and the distinction is deliberate:
 *
 *  - Roster artists are real people. Their photo and discography come from
 *    Spotify or they come from nowhere. Nothing about their catalogue is
 *    generated, ever.
 *  - Generated artists are invented, so their release history is generated
 *    alongside everything else about them.
 *
 * The `source` field on the response says which, and the UI prints it.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  const w = await engine.ensureLoaded();
  const a = w.artists.get(id);
  if (!a) return NextResponse.json({ error: "no such artist" }, { status: 404 });

  const isReal = ROSTER_SET.has(a.name);

  // ---- about, entirely from the simulation
  const months = await prisma.artistMonth.findMany({
    where: { artistId: id },
    orderBy: { monthKey: "asc" },
    select: { monthKey: true, dateMs: true, listeners: true, rank: true },
  });
  const events = await prisma.marketEvent.findMany({
    where: { artistId: id },
    orderBy: { id: "desc" },
    take: 200,
    select: { tMs: true, kind: true, headline: true },
  });

  const peak = months.reduce(
    (best, m) => (m.listeners > (best?.listeners ?? -1) ? m : best),
    months[0],
  );
  const bestRank = months.reduce(
    (best, m) => (m.rank > 0 && m.rank < best ? m.rank : best),
    Number.MAX_SAFE_INTEGER,
  );
  const monthsListed = Math.max(
    0,
    Math.round(((a.exitMs ?? w.simMs) - a.debutMs) / (1000 * 60 * 60 * 24 * 30.44)),
  );
  const notable = events
    .filter((e) => ["breakout", "viral", "sync", "playlist", "labeldrop", "exit"].includes(e.kind))
    .slice(0, 6);

  const about = {
    genre: a.genre,
    tier: a.tier,
    debutMs: a.debutMs,
    debutLabel: fmtSimDate(a.debutMs),
    active: a.active,
    exitMs: a.exitMs,
    exitReason: a.exitReason,
    monthsListed,
    listeners: a.listeners,
    peakListeners: peak?.listeners ?? a.listeners,
    peakMonthMs: peak?.dateMs ?? a.debutMs,
    bestRank: bestRank === Number.MAX_SAFE_INTEGER ? null : bestRank,
    volatility: a.volatility,
    monthlyRoyalty: a.listeners * a.royaltyRate,
    notable,
  };

  // ---- generated artists: simulated catalogue
  if (!isReal) {
    return NextResponse.json({
      source: "simulated",
      isReal: false,
      spotifyConfigured: spotifyConfigured(),
      about,
      avatar: null,
      spotify: null,
      releases: generateReleases(
        w.seed,
        id,
        a.debutMs,
        a.exitMs ?? w.simMs,
        months,
        events,
      ),
    });
  }

  // ---- roster artists: Spotify or nothing
  let profile = await prisma.artistProfile.findUnique({ where: { artistId: id } });
  const stale = !profile || Date.now() - profile.fetchedAt.getTime() > CACHE_MS;

  if (stale && spotifyConfigured()) {
    const found = await findArtist(a.name);
    const releases = found ? await getReleases(found.spotifyId) : [];
    const data = {
      spotifyId: found?.spotifyId ?? null,
      imageUrl: found?.imageUrl ?? null,
      followers: found?.followers ?? null,
      popularity: found?.popularity ?? null,
      genres: found ? JSON.stringify(found.genres) : null,
      externalUrl: found?.externalUrl ?? null,
      releases: JSON.stringify(releases),
      found: Boolean(found),
      fetchedAt: new Date(),
    };
    profile = await prisma.artistProfile.upsert({
      where: { artistId: id },
      create: { artistId: id, ...data },
      update: data,
    });
  }

  return NextResponse.json({
    source: profile?.found ? "spotify" : "unavailable",
    isReal: true,
    spotifyConfigured: spotifyConfigured(),
    about,
    avatar: profile?.imageUrl ?? null,
    spotify: profile?.found
      ? {
          id: profile.spotifyId,
          followers: profile.followers,
          popularity: profile.popularity,
          genres: safeParse(profile.genres) as string[],
          url: profile.externalUrl,
        }
      : null,
    releases: profile?.found ? safeParse(profile.releases) ?? [] : [],
  });
}

function safeParse(s: string | null | undefined) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
