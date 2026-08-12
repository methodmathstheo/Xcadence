import type { RNG } from "@/lib/rng";
import type { ArtistState } from "@/lib/sim/dynamics";

export interface BotState {
  id: number;
  name: string;
  strategy: string;
  cash: number;
  aggression: number;
  horizon: number;
  positions: Map<number, { qty: number; costBasis: number }>;
}

export interface PositionState {
  qty: number;
  costBasis: number;
  realised: number;
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
    artistId: number; botId: number | null; actor: string; side: string;
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
    tMs: number; equity: number; cash: number; marketValue: number; realised: number;
  }[];
  royaltyPayments: {
    positionId: number; monthKey: number; dateMs: number; amount: number;
  }[];
  /** Debuts, inserted on the next flush so they arrive with real database ids. */
  newArtists: Omit<ArtistState, "id">[];
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

  account: {
    cash: number;
    startingCash: number;
    realisedPnl: number;
    sessionStartEquity: number;
  };
  positions: Map<number, PositionState>;

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
  account: {
    cash: number;
    equity: number;
    marketValue: number;
    realisedPnl: number;
    unrealisedPnl: number;
    sessionPnl: number;
  };
}
