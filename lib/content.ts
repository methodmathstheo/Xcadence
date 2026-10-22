import fs from "node:fs";
import path from "node:path";
import instagram from "@/content/instagram.json";
import venuesJson from "@/content/venues.json";

export type Media = {
  file: string;
  poster?: string;
  video: boolean;
  alt: string;
  remote: string;
};

export type Post = {
  shortcode: string;
  url: string;
  date: string;
  location: string | null;
  caption: string;
  likes: number | null;
  venueId: string | null;
  media: Media[];
};

export type Venue = {
  id: string;
  name: string;
  location: string;
  handle: string | null;
  event: string;
  dates: string[];
  note: string;
};

export type ResolvedMedia = Media & {
  /** URL to use for the still image (local if downloaded, otherwise Instagram CDN) */
  src: string;
  /** URL of a playable video file if one exists locally, otherwise null */
  videoSrc: string | null;
  postShortcode: string;
  postUrl: string;
  caption: string;
  date: string;
  location: string | null;
};

const publicDir = path.join(process.cwd(), "public");

function existsLocally(p: string) {
  try {
    return fs.existsSync(path.join(publicDir, p));
  } catch {
    return false;
  }
}

export const profile = instagram.profile;

export const posts: Post[] = (instagram.posts as Post[]).slice().sort((a, b) => (a.date < b.date ? 1 : -1));

export const venues: Venue[] = (venuesJson as Venue[])
  .slice()
  .sort((a, b) => (a.dates[a.dates.length - 1] < b.dates[b.dates.length - 1] ? 1 : -1));

export function resolveMedia(post: Post, m: Media): ResolvedMedia {
  const still = m.video ? m.poster ?? m.file : m.file;
  const src = existsLocally(still) ? still : m.remote;
  const videoSrc = m.video && existsLocally(m.file) ? m.file : null;
  return {
    ...m,
    src,
    videoSrc,
    postShortcode: post.shortcode,
    postUrl: post.url,
    caption: post.caption,
    date: post.date,
    location: post.location,
  };
}

export const allMedia: ResolvedMedia[] = posts.flatMap((p) => p.media.map((m) => resolveMedia(p, m)));

export function mediaForVenue(venueId: string): ResolvedMedia[] {
  return posts.filter((p) => p.venueId === venueId).flatMap((p) => p.media.map((m) => resolveMedia(p, m)));
}

export function avatarSrc() {
  return existsLocally(profile.avatar) ? profile.avatar : profile.avatarRemote;
}

/** Hand-picked hero and featured items (post shortcode + 1-based media index). */
export const featured: Array<[string, number]> = [
  ["DcBPEN-jdmV", 1],
  ["Db6nj8vtu5C", 1],
  ["DZAq87lDToa", 4],
  ["DWjkaugiAmv", 1],
  ["DQ2oJV2iOj6", 5],
  ["DTYGGvCkmtP", 1],
  ["DQ97g87DH_k", 1],
  ["DWjkaugiAmv", 3],
];

export function featuredMedia(): ResolvedMedia[] {
  return featured
    .map(([code, i]) => {
      const p = posts.find((x) => x.shortcode === code);
      const m = p?.media[i - 1];
      return p && m ? resolveMedia(p, m) : null;
    })
    .filter((x): x is ResolvedMedia => !!x);
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", opts);
}
