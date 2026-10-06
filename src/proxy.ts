import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "xc_session";

/** Reachable without an account: the front door and the way in. */
const PUBLIC = new Set(["/", "/login", "/welcome"]);

/**
 * Routing only — not authorization.
 *
 * This checks whether a session cookie is *present*, nothing more: proxy code
 * runs before the render and may be hoisted to a CDN, so it cannot reach the
 * database to find out whether the token is real. Every route that touches
 * money validates the session itself and answers 401 if it does not hold up,
 * so a forged cookie buys a redirect and nothing else.
 */
export function proxy(req: NextRequest) {
  const signedIn = req.cookies.has(COOKIE);
  const { pathname, search } = req.nextUrl;

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

export const config = {
  /**
   * Pages only.
   *
   * `/api` is excluded deliberately: those routes authorize themselves and
   * answer 401 JSON, which a `fetch` can act on — redirecting them to
   * /welcome would hand the client an HTML page where it expected data.
   * Next's own assets and the icon files are excluded too, the favicon in
   * particular, or the tab icon disappears behind the login wall.
   */
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon|apple-touch-icon|mask-icon|icon|manifest).*)",
  ],
};
