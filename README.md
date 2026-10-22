# Henry Hamilton · DJ & Producer

Portfolio site for Henry Hamilton (@henryyhamilton). Next.js 16, Tailwind 4, no CMS. Content comes from two JSON files.

## Run it

```
npm install
npm run media      # downloads the Instagram photos into public/media/instagram (do this first, see below)
npm run dev        # http://localhost:3000
```

## Deploy on Railway

1. Push this folder to a new GitHub repo (`methodmathstheo/henryhamilton`).
2. Railway → New Project → Deploy from GitHub → pick the repo. Build command `npm run build`, start command `npm start`. Nothing else to set.
3. Add the custom domain in Railway settings when Henry has one.

Keep this on its own Railway project, separate from twopumptom.

## Media

`content/instagram.json` holds every post (caption, date, location, media) plus links to Instagram's CDN. Those links expire after a few days, so run `npm run media` once to save the images into `public/media/instagram/` and commit them. The site automatically prefers the local copy when it exists.

Videos: without an Instagram login only the cover frame is available, so reels show their poster and link out to Instagram. To get the actual .mp4 files, run the instaloader script once from your Mac or PC:

```
pip install instaloader
instaloader --login YOUR_IG_USERNAME
python3 scripts/pull_instagram.py --login YOUR_IG_USERNAME
```

It saves every photo and video into `public/media/instagram/` using the same filenames the site expects. Commit and push, and the gallery and hero start playing video.

## Editing

- `content/venues.json`: the Venues tab. Add an entry per venue (id, name, location, Instagram handle, event, dates). Set `venueId` on a post in `instagram.json` to attach its photos to that venue.
- `lib/content.ts` → `featured`: which frames appear in the Selected strip on the homepage.
- `app/page.tsx`: bio copy and the booking section.
- Colours and fonts: `app/globals.css` (`--color-brass` is the single accent).

## Structure

```
app/            pages: / (home), /gallery, /venues
components/     Nav, Footer, Lightbox, MediaGrid, FeaturedStrip, VenueStrip, Reveal
content/        instagram.json, venues.json
lib/content.ts  loads the JSON, resolves local vs remote media
scripts/        fetch_media.mjs (images, no login) and pull_instagram.py (everything, needs login)
```
