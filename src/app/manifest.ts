import type { MetadataRoute } from "next";

/**
 * Web app manifest.
 *
 * Makes the exchange installable — added to a phone home screen or pinned as a
 * desktop app it opens standalone, without browser chrome, which suits a
 * full-bleed trading terminal better than a tab does.
 *
 * `display: standalone` rather than fullscreen: the clock and the ticker are
 * meant to be glanceable alongside other windows, not to take the screen over.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "xcadence — royalty exchange",
    short_name: "xcadence",
    description:
      "A live simulated exchange in artist royalty shares. Virtual currency sandbox, not a financial product.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#161825",
    theme_color: "#161825",
    categories: ["finance", "education", "simulation"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops icons to its own shape; the maskable copy keeps the
      // trace inside the safe area so nothing important gets clipped.
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
