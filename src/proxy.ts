import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clientIp, LIMITS, take, tooMany } from "@/lib/http/limits";

const COOKIE = "xc_session";

/** Reachable without an account: the front door and the way in. */
const PUBLIC = new Set(["/", "/login", "/welcome"]);

/**
 * Pages: routing only — not authorization.
 *
 * This checks whether a session cookie is *present*, nothing more: proxy code
 * runs before the render and may be hoisted to a CDN, so it cannot reach the
 * database to find out whether the token is real. Every route that touches
 * money validates the session itself and answers 401 if it does not hold up,
 * so a forged cookie buys a redirect and nothing else.
 *
 * API: two guards that belong in front of every route rather than in each.
 *
 *   - A request that changes state must come from this site. The session
 *     cookie is SameSite=Lax, which already keeps it off cross-site POSTs in
 *     every current browser; this is the second lock on the same door, for
 *     browsers that do not honour that and for a cookie that one day is not
 *     set that way. Requests with no Origin and no Sec-Fetch-Site (curl, a
 *     script) pass: they carry no ambient credential, so there is nothing
 *     here for a forgery to use.
 *   - One address gets a generous but finite number of API calls a minute,
 *     as a backstop under the per-route limits.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // One address for the venue. A request that arrives for any other host —
  // the Railway service domain, an old link — is sent to the canonical one,
  // with its path and query intact, permanently and method-preserving.
  const canonical = process.env.XCADENCE_CANONICAL_HOST?.trim().toLowerCase();
  if (canonical) {
    const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (host && host !== canonical && !LOCAL_HOSTS.has(host.replace(/:\d+$/, ""))) {
      return NextResponse.redirect(`https://${canonical}${pathname}${search}`, 308);
    }
  }

  if (pathname.startsWith("/api/")) {
    if (!SAFE_METHODS.has(req.method) && crossSite(req)) {
      return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
    }
    // The event stream is one long request, not a burst; the stream route
    // counts those itself.
    if (pathname !== "/api/stream") {
      const r = take(`api:${clientIp(req)}`, LIMITS.api);
      if (!r.ok) return tooMany(r.retryAfterMs);
    }
    return NextResponse.next();
  }

  const signedIn = req.cookies.has(COOKIE);

  if (!signedIn && !PUBLIC.has(pathname)) {
    const to = req.nextUrl.clone();
    to.pathname = "/login";
    // Carry the destination so a shared deep link survives the detour.
    to.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(to);
  }

  // Signing in twice is not a thing. The landing page, by contrast, stays
  // reachable when signed in — it swaps its calls to action and is the only
  // page that explains the venue to someone who already has an account.
  if (signedIn && pathname === "/login") {
    const to = req.nextUrl.clone();
    to.pathname = "/markets";
    to.search = "";
    return NextResponse.redirect(to);
  }

  return NextResponse.next();
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Never redirected: a developer's own machine, whatever the variable says. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

/**
 * True when the browser says this request was made from another site.
 *
 * Sec-Fetch-Site is the authoritative answer where present: same-origin and
 * none (a typed address, a bookmark) are ours. Older browsers send only
 * Origin, which is compared against the host the request arrived for —
 * X-Forwarded-Host where the edge sets it, else Host.
 */
function crossSite(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";

  const origin = req.headers.get("origin");
  if (!origin || origin === "null") return origin === "null";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export const config = {
  /**
   * Everything but Next's own assets and the icon files. The favicon in
   * particular, or the tab icon disappears behind the login wall.
   *
   * `/api` is matched now, for the two guards above only: API routes still
   * authorize themselves and answer 401 JSON rather than being redirected to
   * a login page a `fetch` cannot act on.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon|apple-touch-icon|mask-icon|icon|manifest).*)",
  ],
};
