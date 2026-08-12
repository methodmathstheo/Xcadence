/**
 * The only interface the application is allowed to fetch artist data through.
 *
 * `SimulatedDataProvider` is the live engine. `SpotifyDataProvider` is a stub
 * implementing the same shape so a real backend could be swapped in without
 * touching a page — it is deliberately not built against the Spotify API.
 */

export interface ArtistSummary {
  id: number;
  name: string;
  genre: string;
  /** Which chart the artist trades on. */
  category: "rap" | "rnb";
  tier: string;
  active: boolean;
  debutMs: number;
  exitMs: number | null;
  exitReason: string | null;
  rank: number;
  listeners: number;
  /** Fractional change over the trailing 30 / 90 simulated days. */
  growth30: number;
  growth90: number;
  volatility: number;
  royaltyRate: number;
  monthlyRoyalty: number;
  price: number;
  prevPrice: number;
  /** LMSR state, exposed so the trade ticket can quote without a round trip. */
  q: number;
  b: number;
  vMax: number;
  unitScale: number;
  /** DCF value per contract from public inputs, and price vs that value. */
  fairValue: number;
  divergence: number;
}

export interface ArtistHistoryPoint {
  monthKey: number;
  dateMs: number;
  listeners: number;
  royalty: number;
  rank: number;
}

export interface ChartRow {
  rank: number;
  artistId: number;
  name: string;
  tier: string;
  listeners: number;
}

export interface DataProvider {
  readonly name: string;
  getArtists(opts?: { includeInactive?: boolean }): Promise<ArtistSummary[]>;
  getArtistHistory(id: number): Promise<ArtistHistoryPoint[]>;
  /** Ranked snapshot of the universe as it stood on `dateMs`. */
  getChartSnapshot(dateMs: number): Promise<ChartRow[]>;
}
