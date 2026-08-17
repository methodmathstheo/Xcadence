import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle for the container image.
  output: "standalone",
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
