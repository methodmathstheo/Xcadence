import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { engine } from "@/lib/engine/engine";
import { categoryOf, genreFor, isDemo } from "@/lib/sim/names";
import { fetchOpenProfile } from "@/lib/music/openmusic";
import { fmtSimDate } from "@/lib/sim/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How long a lookup stays good. Catalogues do not change often. */
const CACHE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Artist profile.
 *
 * Every listing is a real artist, so identity, photograph, biography and
 * catalogue all come from open sources — MusicBrainz, Wikipedia and the Cover
 * Art Archive — and are cached here. None of it is generated. When a lookup
 * fails the field stays empty and the page says the data is unavailable rather
 * than filling the space with something invented.
 *
 * The `about` block is the opposite: it is entirely simulation output and is
 * labelled as such wherever it appears.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  const w = await engine.ensureLoaded();
  const a = w.artists.get(id);
  if (!a) return NextResponse.json({ error: "no such artist" }, { status: 404 });

  const [months, events] = await Promise.all([
    prisma.artistMonth.findMany({
      where: { artistId: id },
      orderBy: { monthKey: "asc" },
      select: { monthKey: true, dateMs: true, listeners: true, rank: true },
    }),
    prisma.marketEvent.findMany({
      where: { artistId: id },
      orderBy: { id: "desc" },
      take: 200,
      select: { tMs: true, kind: true, headline: true },
    }),
  ]);

  const peak = months.reduce(
    (best, m) => (m.listeners > (best?.listeners ?? -1) ? m : best),
    months[0],
  );
  const bestRank = months.reduce(
    (best, m) => (m.rank > 0 && m.rank < best ? m.rank : best),
    Number.MAX_SAFE_INTEGER,
  );

  const about = {
    genre: genreFor(a.name),
    category: categoryOf(a.name),
    tier: a.tier,
    debutMs: a.debutMs,
    debutLabel: fmtSimDate(a.debutMs),
    active: a.active,
    exitMs: a.exitMs,
    exitReason: a.exitReason,
    monthsListed: Math.max(
      0,
      Math.round(((a.exitMs ?? w.simMs) - a.debutMs) / (1000 * 60 * 60 * 24 * 30.44)),
    ),
    listeners: a.listeners,
    peakListeners: peak?.listeners ?? a.listeners,
    peakMonthMs: peak?.dateMs ?? a.debutMs,
    bestRank: bestRank === Number.MAX_SAFE_INTEGER ? null : bestRank,
    volatility: a.volatility,
    monthlyRoyalty: a.listeners * a.royaltyRate,
    notable: events
      .filter((e) =>
        ["breakout", "viral", "sync", "playlist", "labeldrop", "exit"].includes(e.kind),
      )
      .slice(0, 6),
  };

  let profile = await prisma.artistProfile.findUnique({ where: { artistId: id } });
  // Demo mode never reaches outside: the names are invented, so there is
  // nothing real to look up and nothing to be careful about publishing.
  const stale = !isDemo() && (!profile || Date.now() - profile.fetchedAt.getTime() > CACHE_MS);

  if (stale) {
    const open = await fetchOpenProfile(a.name);
    const data = {
      mbid: open.mbid,
      bio: open.bio,
      bioUrl: open.bioUrl,
      area: open.area,
      beginYear: open.beginYear,
      imageUrl: open.photoUrl,
      releases: JSON.stringify(open.releases),
      found: open.found,
      fetchedAt: new Date(),
    };
    profile = await prisma.artistProfile.upsert({
      where: { artistId: id },
      create: { artistId: id, ...data },
      update: data,
    });
  }

  const releases = safeParse(profile?.releases) ?? [];

  return NextResponse.json({
    source: profile?.found ? "open" : "unavailable",
    about,
    avatar: profile?.imageUrl ?? null,
    identity: profile?.found
      ? {
          mbid: profile.mbid,
          bio: profile.bio,
          bioUrl: profile.bioUrl,
          area: profile.area,
          beginYear: profile.beginYear,
        }
      : null,
    releases,
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
