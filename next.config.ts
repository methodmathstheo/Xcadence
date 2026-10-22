import type { NextConfig } from "next";

// STATIC_EXPORT=1 npm run build  → static site in ./out (used for previews)
const nextConfig: NextConfig = {
  output: process.env.STATIC_EXPORT ? "export" : undefined,
  trailingSlash: !!process.env.STATIC_EXPORT,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
