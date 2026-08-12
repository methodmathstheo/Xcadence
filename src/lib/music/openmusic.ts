/**
 * Real artist data from open sources — no API keys, no account, no quota.
 *
 *   MusicBrainz       artist identity and the release catalogue (CC0 data)
 *   Cover Art Archive sleeve images for those releases
 *   Wikipedia REST    biography extract and a freely-licensed photograph
 *
 * This exists because the roster is real people and the alternative to real
 * data is invented data, which is not an alternative at all. Nothing here is
 * generated: if a lookup fails the field stays empty and the UI says so.
 *
 * MusicBrainz asks for one request per second and a User-Agent that identifies
 * the application. Both are honoured below — `throttle()` serialises every
 * call through a single promise chain, so concurrent callers queue rather than
 * burst.
 */

const UA = "xcadence/0.1 ( royalty-exchange-simulation; local use )";
const MB = "https://musicbrainz.org/ws/2";
const WIKI = "https://en.wikipedia.org/api/rest_v1";
const CAA = "https://coverartarchive.org";

/** MusicBrainz rate limit: one request per second, sustained. */
const MB_INTERVAL_MS = 1100;

let chain: Promise<unknown> = Promise.resolve();

function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const result = await fn();
    await new Promise((r) => setTimeout(r, MB_INTERVAL_MS));
    return result;
  });
  // Keep the chain alive even when one link rejects.
  chain = next.catch(() => undefined);
  return next;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface OpenRelease {
  title: string;
  type: string;
  year: number | null;
  date: string | null;
  mbid: string;
  coverUrl: string | null;
}

export interface OpenProfile {
  mbid: string | null;
  disambiguation: string | null;
  area: string | null;
  beginYear: number | null;
  /** Wikipedia extract, a few sentences. */
  bio: string | null;
  bioUrl: string | null;
  photoUrl: string | null;
  releases: OpenRelease[];
  found: boolean;
}

/**
 * Resolve a name to a MusicBrainz artist.
 *
 * Accepts a hit only on an exact normalised name match. MusicBrainz will
 * cheerfully return a tribute act or an unrelated act with a similar name, and
 * attaching the wrong person's catalogue to a row is worse than an empty one.
 */
async function findMbArtist(name: string) {
  const url =
    `${MB}/artist?query=${encodeURIComponent(`artist:"${name}"`)}` +
    `&fmt=json&limit=5`;
  const data = await throttle(() =>
    getJson<{
      artists?: {
        id: string; name: string; score: number; country?: string;
        disambiguation?: string;
        area?: { name: string };
        "life-span"?: { begin?: string };
        type?: string;
      }[];
    }>(url),
  );
  if (!data?.artists?.length) return null;

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(name);
  const exact = data.artists.filter((a) => norm(a.name) === target);
  if (exact.length === 0) return null;

  // Where several artists share a name, prefer the US one, then the best score.
  exact.sort((a, b) => {
    const ac = a.country === "US" ? 1 : 0;
    const bc = b.country === "US" ? 1 : 0;
    if (ac !== bc) return bc - ac;
    return (b.score ?? 0) - (a.score ?? 0);
  });
  return exact[0];
}

/** Album, EP and single release groups, newest first. */
async function fetchReleases(mbid: string): Promise<OpenRelease[]> {
  const url =
    `${MB}/release-group?artist=${mbid}` +
    `&type=album|ep|single&fmt=json&limit=100`;
  const data = await throttle(() =>
    getJson<{
      "release-groups"?: {
        id: string; title: string; "primary-type"?: string;
        "first-release-date"?: string;
        "secondary-types"?: string[];
      }[];
    }>(url),
  );
  if (!data?.["release-groups"]) return [];

  const seen = new Set<string>();
  const out: OpenRelease[] = [];
  for (const rg of data["release-groups"]) {
    // Skip compilations, live records and remix packages: they clutter a
    // discography without telling you anything about the artist's output.
    const secondary = rg["secondary-types"] ?? [];
    if (secondary.length > 0) continue;

    const key = rg.title.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);

    const date = rg["first-release-date"] ?? null;
    out.push({
      title: rg.title,
      type: (rg["primary-type"] ?? "release").toLowerCase(),
      year: date ? Number(date.slice(0, 4)) || null : null,
      date,
      mbid: rg.id,
      // Served straight from the Cover Art Archive; a missing sleeve 404s and
      // the <img> falls back to a generated gradient.
      coverUrl: `${CAA}/release-group/${rg.id}/front-250`,
    });
  }

  out.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  return out.slice(0, 48);
}

/** Wikipedia summary: biography extract plus a freely-licensed photograph. */
async function fetchWiki(name: string) {
  const title = encodeURIComponent(name.replace(/\s+/g, "_"));
  const data = await getJson<{
    extract?: string;
    type?: string;
    thumbnail?: { source: string };
    originalimage?: { source: string };
    content_urls?: { desktop?: { page?: string } };
  }>(`${WIKI}/page/summary/${title}`);

  if (!data || data.type === "disambiguation" || !data.extract) return null;
  return {
    bio: data.extract,
    bioUrl: data.content_urls?.desktop?.page ?? null,
    photoUrl: data.thumbnail?.source ?? data.originalimage?.source ?? null,
  };
}

/** Everything known about one real artist, from open sources. */
export async function fetchOpenProfile(name: string): Promise<OpenProfile> {
  const [mb, wiki] = await Promise.all([findMbArtist(name), fetchWiki(name)]);
  const releases = mb ? await fetchReleases(mb.id) : [];

  return {
    mbid: mb?.id ?? null,
    disambiguation: mb?.disambiguation ?? null,
    area: mb?.area?.name ?? mb?.country ?? null,
    beginYear: mb?.["life-span"]?.begin
      ? Number(mb["life-span"]!.begin!.slice(0, 4)) || null
      : null,
    bio: wiki?.bio ?? null,
    bioUrl: wiki?.bioUrl ?? null,
    photoUrl: wiki?.photoUrl ?? null,
    releases,
    found: Boolean(mb || wiki),
  };
}
