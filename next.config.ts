import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle for the container image.
  output: "standalone",
  /**
   * Icons were served with `max-age=0, must-revalidate`, so every page load
   * re-fetched and revalidated the favicon — it could never be instant.
   *
   * A week, with a week of stale-while-revalidate on top: repeat loads paint
   * the icon from cache immediately and any refresh happens in the background.
   * Safe to cache this hard because Next fingerprints the href it links
   * (/favicon.ico?favicon.<hash>.ico), so changing the artwork changes the URL
   * and browsers fetch the new one regardless of what is cached at the bare
   * path.
   */
  async headers() {
    return [
      {
        source: "/:icon(favicon.ico|icon.png|apple-icon.png|icon-192.png|icon-512.png|icon-512-maskable.png)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
  images: {
    // Artist photographs are hotlinked from Wikimedia; album art from the
    // Cover Art Archive. Both are served as plain <img>, so this only matters
    // if next/image is ever used for them.
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "coverartarchive.org" },
      { protocol: "https", hostname: "i.scdn.co" },
    ],
  },
};

export default nextConfig;
