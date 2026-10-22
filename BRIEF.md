# Henry Hamilton – DJ & Producer site

Brief for Claude Code. Same approach as the TwoPumpTom build: Next.js + Tailwind, GitHub repo under methodmathstheo, deployed on Railway.

## Who

Henry Hamilton, Essex-based DJ and producer. Instagram: https://www.instagram.com/henryyhamilton/ (the only social link for now). The site is a portfolio and shop window for bookings, not a link-in-bio.

## Reference

Open the `twopumptom` repo first and reuse its stack, config, folder layout, deploy setup and the overall feel (slick, high-contrast, full-bleed media, nothing templated). This site should look like it came from the same studio, but Henry's needs to read classier: slower, darker, more editorial. Think record-label landing page rather than creator page.

## Stack

- Next.js (App Router), TypeScript, Tailwind. Match the versions in `twopumptom`.
- Static media in `public/media/instagram/` (filled by the pull script below).
- Content in `content/instagram.json` and `content/venues.json`. No CMS, no database.
- `next/image` for stills, native `<video>` for clips (muted, loop, playsInline, autoplay on hover/in-view, poster from the Instagram thumbnail).
- Deploy on Railway, same settings as `twopumptom`. Add a `.gitattributes` with Git LFS for `public/media/**` if the pulled media is over ~100 MB total.

## Content pipeline (do this before building pages)

`scripts/pull_instagram.py` is in the repo. It uses `instaloader` to:

1. Download every post on @henryyhamilton (images, carousels, reels/videos) into `public/media/instagram/`
2. Write `content/instagram.json` (bio, follower count, avatar, and per post: caption, date, media files, location tag, @mentions, tagged accounts)
3. Write `content/venues.draft.json`, a first pass at venues pulled from Instagram location tags, "@ Venue" / "at Venue" phrases in captions, and tagged accounts on posts that look like gig posts

Run it once:

```
pip install instaloader
instaloader --login <my IG username>      # one-time, creates a session file
python3 scripts/pull_instagram.py --login <my IG username>
```

Then open `content/venues.draft.json`, delete anything that is not a venue, fix names, add the town in `location`, and save it as `content/venues.json`. Do not ship the draft.

Build the pages against `instagram.json`. Every photo and video from the profile goes on the site somewhere (Gallery shows all of them); the homepage picks the best six or so by hand via a `featured` list in `content/site.ts`.

## Pages / tabs

Single-page layout with a fixed top nav that scrolls to sections, plus `/gallery` and `/venues` as their own routes (so the nav reads as tabs). Nav: **Home · Gallery · Venues · Book**.

### Home (`/`)
- Full-viewport hero: one strong video clip from Instagram playing muted behind large serif type, "HENRY HAMILTON" with "DJ & Producer · Essex" as a small caps subline. Subtle film grain overlay and a slow Ken Burns drift if it is a still rather than a clip.
- Short bio, lifted from the Instagram bio and tidied, in a narrow measure. One sentence on sound/genres (ask me if not obvious from captions).
- Featured strip: horizontal scroll of 6 to 8 featured posts (mix of stills and clips), each opening the Gallery lightbox.
- "Recently played" block: the four most recent venues from `venues.json` with dates, linking to the Venues tab.
- Instagram CTA: follower count pulled from `instagram.json`, big "Follow on Instagram" link.
- Footer: Instagram icon, "Bookings" mailto (placeholder `bookings@henryhamilton.co.uk` until Henry confirms), copyright, "Site by Theo Elwell" in small type.

### Gallery (`/gallery`)
- Masonry grid of every post, newest first. Videos show the poster and play on hover (desktop) or when scrolled into view (mobile).
- Filter chips: All · Photos · Videos. Optional third chip per venue if a post has a matching location.
- Click opens a full-screen lightbox: media, caption (links @mentions to Instagram), date, "View on Instagram" link. Keyboard arrows and swipe to move between posts.

### Venues (`/venues`)
- Heading "Played at", then a list of venues from `venues.json`, grouped by year of last appearance, newest first.
- Each row: venue name (large serif), town, number of appearances, first and last date, and a thumbnail strip of the posts tagged there (match by location name or handle). Row expands or links to the Gallery filtered to that venue.
- If a venue has an Instagram handle, link the name to it.
- Keep it typographic. No map, no pins, no cards with borders. Think the credits page of a tour programme.

### Book (`#book` on the homepage)
- Two lines of copy and a single mailto button. Add a short form later only if Henry wants one.

## Design direction

- Palette: near-black background (`#0a0a0a`), off-white type (`#f2efe9`), one accent used sparingly for hover states and the active nav tab (pick a warm metallic, something like `#c9a96e`; show me before committing). No gradients, no neon.
- Type: a high-contrast editorial serif for display (Fraunces, or Instrument Serif from Google Fonts) paired with a neutral grotesk for body (Inter or Geist). Display sizes big, tracking tight, lots of whitespace.
- Motion: slow and restrained. Fade-up on scroll, 600ms ease-out, no bounce. Video crossfades on hover. Respect `prefers-reduced-motion`.
- Imagery is the point. Media edge to edge on mobile, generous gutters on desktop. Grain overlay at ~6% opacity on the hero only.
- Mobile first. Check on a 390px viewport and at 1440px.
- No em dashes anywhere in copy.

## Nice to have (only if quick)

- `/api/instagram` route that re-reads `instagram.json` at build time so a re-run of the pull script plus a push refreshes the site.
- OG image generated from the hero still with his name.
- Lighthouse 90+ on performance; lazy-load everything below the fold and serve video as `.mp4` with a `.webm` fallback if ffmpeg is available.

## Definition of done

- `npm run build` passes with zero warnings
- Every media file in `public/media/instagram/` appears in the Gallery
- Venues tab renders from `venues.json` with no hardcoded venue names in components
- Deployed on Railway at the generated URL; custom domain to follow
- README with the three commands above so I can refresh the media whenever Henry posts
