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

  // Refresh the public roster sources if stale and list whoever now
  // qualifies, then fetch their profiles. Hourly once the category set is
  // fully read; every ten minutes while some of it is still due, so a
  // re-read finishes in under an hour. Nothing here can stop the clock.
  const HOUR = 3600 * 1000;
  const SOON = 10 * 60 * 1000;
  const schedule = (delay: number) => {
    setTimeout(() => {
      void engine
        .maintainRoster()
        .then(({ added, remaining }) => {
          if (added > 0) void warmProfiles(world.runId).catch(() => {});
          schedule(remaining > 0 ? SOON : HOUR);
        })
        .catch((e) => {
          console.error("[roster] maintenance failed", e);
          schedule(HOUR);
        });
    }, delay).unref?.();
  };
  schedule(SOON);

  // Clear out guest accounts whose sessions have lapsed. Also not awaited —
  // it is housekeeping, and nothing should wait on it to serve a page.
  const { startGuestSweeper } = await import("@/lib/auth/guests");
  startGuestSweeper();
}
