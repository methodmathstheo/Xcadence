import type { RNG } from "@/lib/rng";
import type { ArtistState } from "@/lib/sim/dynamics";
import type { OfferingState, OfferingPositionState } from "@/lib/engine/offerings";

export interface BotState {
  id: number;
  name: string;
  strategy: string;
  cash: number;
  aggression: number;
  horizon: number;
  positions: Map<number, { qty: number; costBasis: number }>;
  /**
   * Artists this bot has traded since the last flush.
   *
   * Without this the flush rewrote every bot's entire book on every pass —
   * thirty-two desks holding a couple of hundred names each, so upwards of
   * seven thousand round trips inside one write transaction every five
   * seconds. It held SQLite's write lock for about twelve seconds at a time,
   * which is what made signing in intermittently take tens of seconds.
   */
  dirtyPositions: Set<number>;
}

export interface PositionState {
  qty: number;
  costBasis: number;
  realised: number;
}

export interface AccountState {
  cash: number;
  startingCash: number;
  realisedPnl: number;
  sessionStartEquity: number;
}

/**
 * One person's book inside a run: their cash, their open markets and their
 * royalty positions. The market itself — prices, artists, bots, the index — is
 * shared, so two people watching the same tape see the same quotes and move
 * each other's marks, but they own separate capital.
 */
export interface Book {
  userId: number;
  account: AccountState;
  positions: Map<number, PositionState>;
  offeringPositions: OfferingPositionState[];
  /** Artists traded since the last flush. Same reason as `BotState`. */
  dirtyPositions: Set<number>;
  /** Cash or realised P&L moved — a royalty settlement does this on its own. */
  accountDirty: boolean;
}

export interface TapeEntry {
  id: string;
  kind: "trade" | "event";
  tMs: number;
  artistId: number | null;
  artistName: string;
  text: string;
  side?: "BUY" | "SELL";
  qty?: number;
  price?: number;
  actor?: string;
  eventKind?: string;
  magnitude?: number;
}

export interface PendingWrites {
  trades: {
    artistId: number; botId: number | null; userId: number | null;
    actor: string; side: string;
    qty: number; cost: number; priceBefore: number; priceAfter: number;
    tMs: number; realised: number;
  }[];
  events: {
    artistId: number | null; kind: string; magnitude: number;
    headline: string; tMs: number;
  }[];
  pricePoints: { artistId: number; tMs: number; price: number }[];
  months: {
    artistId: number; monthKey: number; dateMs: number;
    listeners: number; royalty: number; rank: number;
  }[];
  indexPoints: { tMs: number; equal: number; weighted: number }[];
  equityPoints: {
    userId: number; tMs: number; equity: number; cash: number;
    marketValue: number; realised: number;
  }[];
  royaltyPayments: {
    positionId: number; monthKey: number; dateMs: number; amount: number;
  }[];
  /** Debuts, inserted on the next flush so they arrive with real database ids. */
  newArtists: Omit<ArtistState, "id">[];
  /** New primary-market listings, same deferred-id treatment as debuts. */
  newOfferings: Omit<OfferingState, "id">[];
  offeringUpdates: OfferingState[];
  offeringPositionUpdates: OfferingPositionState[];
}

export interface World {
  runId: number;
  seed: number;
  rng: RNG;

  simMs: number;
  startMs: number;
  speed: number;
  running: boolean;
  tick: number;
  lastMonthKey: number;

  indexBaseEqual: number;
  indexBaseWeighted: number;
  index: { equal: number; weighted: number };

  artists: Map<number, ArtistState>;
  order: number[];
  bots: BotState[];

  /**
   * Every signed-in trader's book, keyed by user id. Loaded lazily: a book
   * enters the map the first time that person touches the venue in this
   * process, and is written back on every flush thereafter.
   */
  books: Map<number, Book>;

  /**
   * Shared passive-flow level in units of `b`, an OU process around zero.
   * In memory only: it is mean-zero, so a restart resuming at the mean is
   * correct rather than lossy.
   */
  passiveLevel: number;

  offerings: OfferingState[];

  /** Recent price samples per artist for the live charts (not durable). */
  priceRing: Map<number, { t: number; p: number }[]>;
  tape: TapeEntry[];

  dirty: Set<number>;
  pending: PendingWrites;
  /** Artists whose price changed since the last SSE frame. */
  changed: Set<number>;
}

export interface StreamFrame {
  simMs: number;
  tick: number;
  speed: number;
  running: boolean;
  wallMs: number;
  index: { equal: number; weighted: number };
  /** [artistId, price, prevPrice, listeners] for markets that moved. */
  prices: [number, number, number, number][];
  tape: TapeEntry[];
  /** The viewer's own book, or null for an unauthenticated stream. */
  account: AccountFrame | null;
}

export interface AccountFrame {
  cash: number;
  equity: number;
  marketValue: number;
  realisedPnl: number;
  unrealisedPnl: number;
  sessionPnl: number;
}
