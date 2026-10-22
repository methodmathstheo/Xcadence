#!/usr/bin/env python3
"""
Pull @henryyhamilton's Instagram into the site.

What it does
  1. Downloads every post (images, carousels, videos/reels) into public/media/instagram/
  2. Writes content/instagram.json  - profile bio + one entry per post (caption, date, media, location, mentions)
  3. Writes content/venues.draft.json - a first-pass venue list pulled from location tags, @mentions and captions.
     Review this file by hand, then save it as content/venues.json for the site to use.

Setup (once)
  pip install instaloader
  instaloader --login YOUR_IG_USERNAME      # creates a session file so Instagram doesn't rate-limit you

Run (from the project root)
  python3 scripts/pull_instagram.py --login YOUR_IG_USERNAME

Re-run any time Henry posts; it only downloads new media.
"""

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

import instaloader

PROFILE = "henryyhamilton"
MEDIA_DIR = Path("public/media/instagram")
CONTENT_DIR = Path("content")

# Words that usually mean a caption is naming a venue or event
VENUE_WORDS = re.compile(
    r"\b(club|bar|lounge|rooms?|warehouse|festival|arena|hall|garden|terrace|rooftop|"
    r"boat|pier|pavilion|hotel|house|yard|studio|basement|stage|tent|field|park|"
    r"nightclub|nightlife|residency|resident|headline|support|b2b|set|closing|opening)\b",
    re.I,
)
# "@ venue" / "at venue" / "live at venue" style phrases
AT_PATTERN = re.compile(r"(?:^|\s)(?:live\s+)?(?:at|@)\s+([A-Z][\w'&\-\. ]{2,40})", re.M)


def pull(login: str | None):
    L = instaloader.Instaloader(
        dirname_pattern=str(MEDIA_DIR),
        filename_pattern="{date_utc:%Y-%m-%d}_{shortcode}",
        download_videos=True,
        download_video_thumbnails=True,
        download_comments=False,
        download_geotags=False,
        save_metadata=False,
        post_metadata_txt_pattern="",
        compress_json=False,
        quiet=False,
    )
    if login:
        L.load_session_from_file(login)

    profile = instaloader.Profile.from_username(L.context, PROFILE)

    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    CONTENT_DIR.mkdir(parents=True, exist_ok=True)

    posts = []
    venue_hits = defaultdict(lambda: {"name": "", "count": 0, "sources": set(), "dates": []})

    for post in profile.get_posts():
        L.download_post(post, target=PROFILE)

        base = f"{post.date_utc:%Y-%m-%d}_{post.shortcode}"
        media = []
        if post.typename == "GraphSidecar":
            for i, node in enumerate(post.get_sidecar_nodes(), start=1):
                ext = "mp4" if node.is_video else "jpg"
                media.append({"file": f"/media/instagram/{base}_{i}.{ext}", "video": node.is_video})
        else:
            ext = "mp4" if post.is_video else "jpg"
            media.append({"file": f"/media/instagram/{base}.{ext}", "video": post.is_video})

        caption = post.caption or ""
        mentions = sorted(set(post.caption_mentions)) if caption else []
        tagged = [u.username for u in post.tagged_users] if hasattr(post, "tagged_users") else []
        location = None
        try:
            if post.location:
                location = {"name": post.location.name, "lat": post.location.lat, "lng": post.location.lng}
        except Exception:
            pass

        posts.append(
            {
                "shortcode": post.shortcode,
                "url": f"https://www.instagram.com/p/{post.shortcode}/",
                "date": post.date_utc.isoformat(),
                "caption": caption,
                "mentions": mentions,
                "tagged": tagged,
                "location": location,
                "media": media,
                "likes": post.likes,
                "is_video": post.is_video,
            }
        )

        # ---- venue candidates ----
        date = post.date_utc.strftime("%Y-%m-%d")
        if location:
            key = location["name"].strip().lower()
            v = venue_hits[key]
            v["name"] = location["name"].strip()
            v["count"] += 1
            v["sources"].add("location")
            v["dates"].append(date)
        for m in AT_PATTERN.findall(caption):
            key = m.strip().lower()
            v = venue_hits[key]
            v["name"] = v["name"] or m.strip()
            v["count"] += 1
            v["sources"].add("caption")
            v["dates"].append(date)
        if VENUE_WORDS.search(caption):
            for handle in mentions + tagged:
                key = f"@{handle}".lower()
                v = venue_hits[key]
                v["name"] = v["name"] or f"@{handle}"
                v["count"] += 1
                v["sources"].add("mention")
                v["dates"].append(date)

    out = {
        "profile": {
            "username": profile.username,
            "name": profile.full_name,
            "bio": profile.biography,
            "external_url": profile.external_url,
            "followers": profile.followers,
            "posts": profile.mediacount,
            "avatar": f"/media/instagram/{PROFILE}_profile_pic.jpg",
        },
        "posts": posts,
    }
    (CONTENT_DIR / "instagram.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))

    venues = sorted(
        (
            {
                "name": v["name"],
                "handle": v["name"] if v["name"].startswith("@") else None,
                "location": "",  # fill in: e.g. "Southend-on-Sea"
                "appearances": v["count"],
                "first": min(v["dates"]),
                "last": max(v["dates"]),
                "sources": sorted(v["sources"]),
                "keep": True,  # set false to drop from the site
            }
            for v in venue_hits.values()
        ),
        key=lambda x: (-x["appearances"], x["name"].lower()),
    )
    (CONTENT_DIR / "venues.draft.json").write_text(json.dumps(venues, indent=2, ensure_ascii=False))

    # profile picture
    L.download_profilepic(profile)

    print(f"\nDone. {len(posts)} posts, {sum(len(p['media']) for p in posts)} media files.")
    print(f"Venue candidates: {len(venues)} -> content/venues.draft.json (review, then rename to venues.json)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--login", help="Instagram username whose saved session to use (run `instaloader --login USER` first)")
    args = ap.parse_args()
    pull(args.login)
