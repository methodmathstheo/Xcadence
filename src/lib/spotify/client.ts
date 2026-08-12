/**
 * Spotify Web API, client-credentials flow.
 *
 * Used for one narrow purpose: the profile photo, follower/popularity figures
 * and real release list of the hundred real artists on the roster. It is never
 * used for anything the market runs on — prices, listeners, royalties and
 * every hidden parameter come from the simulation, and no figure from Spotify
 * is ever fed into a valuation.
 *
 * Without credentials every function here returns null and the app falls back
 * to generated monogram avatars. That is the default state, not an error.
 */

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";

export interface SpotifyArtist {
  spotifyId: string;
  name: string;
  imageUrl: string | null;
  followers: number;
  popularity: number;
  genres: string[];
  externalUrl: string;
}

export interface SpotifyRelease {
  name: string;
  type: string;
  year: number;
  imageUrl: string | null;
  url: string;
  totalTracks: number;
}

export function spotifyConfigured(): boolean {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  if (!spotifyConfigured()) return null;
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) return cachedToken.value;

  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
  ).toString("base64");

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[spotify] token request failed", res.status);
      return null;
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = {
      value: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    return cachedToken.value;
  } catch (err) {
    console.error("[spotify] token request threw", err);
    return null;
  }
}

async function api<T>(path: string): Promise<T | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 429) {
      // Respect the rate limit rather than hammering it; the caller caches.
      console.warn("[spotify] rate limited", res.headers.get("retry-after"));
      return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.error("[spotify] request threw", err);
    return null;
  }
}

/**
 * Resolve a roster name to a Spotify artist.
 *
 * Takes the top search hit only if it matches the name closely. Spotify's
 * search is fuzzy and will happily return a covers act or a soundalike for an
 * exact query, and attaching the wrong person's face to a row is worse than
 * showing no face at all.
 */
export async function findArtist(name: string): Promise<SpotifyArtist | null> {
  const q = encodeURIComponent(name);
  const data = await api<{
    artists: {
      items: {
        id: string; name: string; popularity: number;
        followers: { total: number }; genres: string[];
        images: { url: string; width: number }[];
        external_urls: { spotify: string };
      }[];
    };
  }>(`/search?q=${q}&type=artist&limit=5`);

  if (!data?.artists?.items?.length) return null;

  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(name);
  const hit =
    data.artists.items.find((a) => norm(a.name) === target) ??
    data.artists.items.find((a) => norm(a.name).startsWith(target));
  if (!hit) return null;

  // Prefer a mid-size image; the 640px original is wasteful for a 32px avatar.
  const sorted = [...(hit.images ?? [])].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const image = sorted.find((i) => (i.width ?? 0) >= 160) ?? sorted[sorted.length - 1];

  return {
    spotifyId: hit.id,
    name: hit.name,
    imageUrl: image?.url ?? null,
    followers: hit.followers?.total ?? 0,
    popularity: hit.popularity ?? 0,
    genres: hit.genres ?? [],
    externalUrl: hit.external_urls?.spotify ?? `https://open.spotify.com/artist/${hit.id}`,
  };
}

/** Real releases, newest first, deduplicated by title. */
export async function getReleases(spotifyId: string): Promise<SpotifyRelease[]> {
  const data = await api<{
    items: {
      id: string; name: string; album_type: string; release_date: string;
      total_tracks: number; images: { url: string; width: number }[];
      external_urls: { spotify: string };
    }[];
  }>(`/artists/${spotifyId}/albums?include_groups=album,single&limit=50&market=US`);

  if (!data?.items) return [];

  const seen = new Set<string>();
  const out: SpotifyRelease[] = [];
  for (const it of data.items) {
    const key = it.name.toLowerCase().trim();
    if (seen.has(key)) continue; // Spotify lists many regional duplicates
    seen.add(key);
    const sorted = [...(it.images ?? [])].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
    const image = sorted.find((i) => (i.width ?? 0) >= 160) ?? sorted[sorted.length - 1];
    out.push({
      name: it.name,
      type: it.album_type,
      year: Number((it.release_date ?? "").slice(0, 4)) || 0,
      imageUrl: image?.url ?? null,
      url: it.external_urls?.spotify ?? "",
      totalTracks: it.total_tracks ?? 0,
    });
  }
  out.sort((a, b) => b.year - a.year);
  return out.slice(0, 24);
}
