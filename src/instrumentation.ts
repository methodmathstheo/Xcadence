/**
 * Boots the market clock with the server process, not with a page request.
 * The clock is a property of the venue, not of anyone looking at it — closing
 * the browser leaves it running, and the first request after a restart finds
 * the world already loaded and ticking.
 *
 * Everything Node-specific lives behind the dynamic import so this file stays
 * clean when Next also compiles it for the edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { engine } = await import("@/lib/engine/engine");
  await engine.boot();
}
