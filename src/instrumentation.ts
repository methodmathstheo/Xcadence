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

  // Before anything touches the database: the engine writes every five
  // seconds, and on the default rollback journal that blocked every
  // request-path write behind it — which is what made signing in flaky.
  const { tuneSqlite } = await import("@/lib/db");
  await tuneSqlite();

  const { engine } = await import("@/lib/engine/engine");
  const world = await engine.boot();

  // Fill artist photos and catalogues in the background. Deliberately not
  // awaited: it takes about nine minutes at MusicBrainz's rate limit and
  // nothing should wait on it.
  const { warmProfiles } = await import("@/lib/music/warmer");
  void warmProfiles(world.runId).catch(() => {});

  // Clear out guest accounts whose sessions have lapsed. Also not awaited —
  // it is housekeeping, and nothing should wait on it to serve a page.
  const { startGuestSweeper } = await import("@/lib/auth/guests");
  startGuestSweeper();
}
