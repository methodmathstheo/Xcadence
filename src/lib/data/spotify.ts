import type {
  ArtistHistoryPoint,
  ArtistSummary,
  ChartRow,
  DataProvider,
} from "@/lib/data/provider";

/**
 * Stub. Present so the seam is real and the app never assumes the simulation
 * is the only possible source — not implemented, and deliberately not built
 * against the Spotify API.
 *
 * Anything wiring this up would have to solve, at minimum:
 *  - Spotify exposes monthly listeners on the artist page but not through the
 *    Web API, so `getArtists` has no first-party endpoint behind it.
 *  - There is no historical listener series; history would have to be
 *    accumulated forward from first poll, not backfilled.
 *  - Royalty income is not public at all. Everything downstream of
 *    `royaltyRate` would need a different source or an explicit assumption.
 */
export class SpotifyDataProvider implements DataProvider {
  readonly name = "spotify";

  async getArtists(): Promise<ArtistSummary[]> {
    throw new Error("SpotifyDataProvider is a stub — not implemented.");
  }

  async getArtistHistory(): Promise<ArtistHistoryPoint[]> {
    throw new Error("SpotifyDataProvider is a stub — not implemented.");
  }

  async getChartSnapshot(): Promise<ChartRow[]> {
    throw new Error("SpotifyDataProvider is a stub — not implemented.");
  }
}
