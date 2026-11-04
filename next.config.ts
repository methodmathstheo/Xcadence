import type { NextConfig } from "next";

const dev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy.
 *
 * Scripts and styles allow 'unsafe-inline' because Next's hydration payload
 * and React's style attributes are inline; the policy still refuses any
 * script that is not served from this origin, which is the part that
 * matters against an injected tag. Images may come from any https origin:
 * artist photographs are hotlinked from Wikimedia and sleeves from the Cover
 * Art Archive, which redirects across archive.org hosts. Nothing else leaves
 * the origin. 'unsafe-eval' is granted to the dev server only, which needs
 * it for fast refresh.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // A year, subdomains included. Railway terminates TLS and redirects plain
  // HTTP itself; this tells browsers never to try plain HTTP in the first place.
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle for the container image.
  output: "standalone",
  // No reason to advertise the framework on every response.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
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
      {
        source: "/:icon(favicon.ico|favicon-16.png|favicon-32.png|apple-touch-icon.png|apple-icon.png|mask-icon.svg|icon-192.png|icon-512.png|icon-512-maskable.png)",
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
    // Artist photographs and sleeves are plain <img> tags, so the optimizer
    // was never used — and its endpoint (/_next/image) has been the subject
    // of more than one remote-code-execution advisory. Off means the
    // endpoint does not exist.
    unoptimized: true,
  },
};

export default nextConfig;
