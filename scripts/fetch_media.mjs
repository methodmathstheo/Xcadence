#!/usr/bin/env node
/**
 * Pulls every photo and video referenced in content/instagram.json into public/media/instagram/
 * so the site serves its own copies instead of Instagram's expiring CDN links.
 *
 *   node scripts/fetch_media.mjs            # only fetches what is missing
 *   node scripts/fetch_media.mjs --force    # re-fetches everything
 *
 * How it finds the files, in order:
 *   1. Instagram's public embed page for each post (no login needed). This carries fresh
 *      image URLs AND the .mp4 URLs for reels/clips, in carousel order.
 *   2. The `remote` image links saved in instagram.json (expire a few days after capture).
 *   3. If both fail: run scripts/pull_instagram.py with an Instagram login.
 *
 * Runs automatically as `prebuild` on Railway and in the GitHub Action (.github/workflows/media.yml),
 * which commits the downloaded files back to the repo.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const force = process.argv.includes("--force");
const data = JSON.parse(fs.readFileSync(path.join(root, "content/instagram.json"), "utf8"));
const publicDir = path.join(root, "public");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const present = (p) => {
  const f = path.join(publicDir, p);
  return fs.existsSync(f) && fs.statSync(f).size > 1000;
};

async function download(url, target) {
  const dest = path.join(publicDir, target);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const r = await fetch(url, { headers: { "user-agent": UA, referer: "https://www.instagram.com/" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1000) throw new Error("empty response");
  fs.writeFileSync(dest, buf);
  return buf.length;
}

/** Scrape the embed page: returns [{image, video|null}, ...] in carousel order, or null if blocked. */
async function scrapeEmbed(shortcode) {
  try {
    const r = await fetch(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, {
      headers: { "user-agent": UA, "accept-language": "en-GB,en;q=0.9" },
    });
    if (!r.ok) return null;
    const html = await r.text();
    const un = (s) =>
      s
        .replace(/\\\\u0026/g, "&")
        .replace(/\\u0026/g, "&")
        .replace(/\\\\\//g, "/")
        .replace(/\\\//g, "/")
        .replace(/\\\\u0025/g, "%")
        .replace(/\\u0025/g, "%");
    const re = /"(display_url|video_url)\\*":\\*"(https:[^"]+?)\\*"/g;
    const items = [];
    let cur = null;
    let m;
    while ((m = re.exec(html))) {
      const u = un(m[2]);
      if (m[1] === "display_url") {
        cur = { image: u, video: null };
        items.push(cur);
      } else if (cur && !cur.video) {
        cur.video = u;
      }
    }
    // Single-image posts expose the image via og:image only
    if (items.length === 0) {
      const og = html.match(/property="og:image" content="([^"]+)"/);
      if (og) items.push({ image: og[1].replace(/&amp;/g, "&"), video: null });
    }
    return items.length ? items : null;
  } catch {
    return null;
  }
}

let ok = 0, skipped = 0, failed = 0, scraped = 0;
const failures = [];

for (const post of data.posts) {
  const needed = post.media.filter((m) => force || !present(m.file) || (m.video && !present(m.poster)));
  if (needed.length === 0) { skipped += post.media.length; continue; }

  const embed = await scrapeEmbed(post.shortcode);
  if (embed) scraped++;
  if (embed && embed.length !== post.media.length) {
    console.warn(`! ${post.shortcode}: embed lists ${embed.length} items, json has ${post.media.length}; matching by position`);
  }

  for (let i = 0; i < post.media.length; i++) {
    const m = post.media[i];
    const e = embed?.[i];
    const jobs = [];
    const still = m.video ? m.poster : m.file;
    if (force || !present(still)) jobs.push({ target: still, urls: [e?.image, m.remote].filter(Boolean) });
    if (m.video && (force || !present(m.file))) jobs.push({ target: m.file, urls: [e?.video, m.remoteVideo].filter(Boolean) });

    for (const job of jobs) {
      let done = false;
      for (const url of job.urls) {
        try {
          const bytes = await download(url, job.target);
          console.log(`saved ${job.target} (${Math.round(bytes / 1024)} KB)`);
          ok++; done = true; break;
        } catch (err) {
          console.warn(`  retry ${job.target}: ${err.message}`);
        }
      }
      if (!done) { failed++; failures.push(job.target); }
    }
  }
}

// profile picture
if (force || !present(data.profile.avatar)) {
  try {
    await download(data.profile.avatarRemote.replace("s150x150", "s320x320"), data.profile.avatar);
    ok++;
  } catch { failed++; failures.push(data.profile.avatar); }
}

console.log(`\n${ok} downloaded, ${skipped} already present, ${failed} failed. Embed pages reached: ${scraped}.`);
if (failed) {
  console.log("Missing:\n  " + failures.join("\n  "));
  console.log("\nIf everything failed, Instagram is blocking this network. Run from a home connection, or use scripts/pull_instagram.py with a login.");
}
