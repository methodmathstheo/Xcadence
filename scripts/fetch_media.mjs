#!/usr/bin/env node
/**
 * Downloads every image referenced in content/instagram.json into public/media/instagram/
 * so the site serves its own copies instead of Instagram's (expiring) CDN links.
 *
 *   node scripts/fetch_media.mjs
 *
 * Videos: Instagram only exposes the cover frame without a login, so this script saves
 * the poster image for each clip. To get the .mp4 files too, run scripts/pull_instagram.py
 * (instaloader, needs an Instagram login). The site plays local .mp4s automatically when present.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const data = JSON.parse(fs.readFileSync(path.join(root, "content/instagram.json"), "utf8"));
const outDir = path.join(root, "public");

const jobs = [];
for (const p of data.posts) {
  for (const m of p.media) {
    const target = m.video ? m.poster : m.file;
    jobs.push({ target, url: m.remote });
  }
}
jobs.push({ target: data.profile.avatar, url: data.profile.avatarRemote.replace("s150x150", "s320x320") });

let ok = 0, skipped = 0, failed = 0;
for (const j of jobs) {
  const dest = path.join(outDir, j.target);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { skipped++; continue; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    const r = await fetch(j.url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    ok++;
    process.stdout.write(`saved ${j.target}\n`);
  } catch (e) {
    failed++;
    process.stdout.write(`FAILED ${j.target}: ${e.message}\n`);
  }
}
console.log(`\n${ok} downloaded, ${skipped} already present, ${failed} failed.`);
if (failed) console.log("Failures usually mean the CDN links have expired. Run scripts/pull_instagram.py to refresh.");
