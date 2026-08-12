export const TIERS = ["superstar", "established", "emerging", "dormant"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABEL: Record<Tier, string> = {
  superstar: "Superstar",
  established: "Established",
  emerging: "Emerging",
  dormant: "Dormant",
};

/** Tier is a *classification of observed listeners*, not an input. */
export function classifyTier(listeners: number): Tier {
  if (listeners >= 8_000_000) return "superstar";
  if (listeners >= 800_000) return "established";
  if (listeners >= 40_000) return "emerging";
  return "dormant";
}

/**
 * A contract is a fractional claim on an artist's discounted royalty stream.
 * The fraction is not the same for every artist: at listing, each market picks
 * a `unitScale` so the opening quote falls inside this band. Without it a
 * superstar contract would cost ~90,000 credits and a dormant one 0.02, and no
 * single account could trade both. Real exchanges do the same thing with
 * contract multipliers and share splits.
 *
 *   price = PV / unitScale
 */
export const CONTRACT_PRICE_BAND = { lo: 8, hi: 240 } as const;

/** Fallback unit size, used only where an artist record is unavailable. */
export const CONTRACT_DIVISOR = 10_000;

/** Valuation horizon used everywhere unless a tool overrides it. */
export const DEFAULT_HORIZON_MONTHS = 120;
export const DEFAULT_DISCOUNT = 0.14;

/** Credits of quoted depth per tier — sets the LMSR `b`. */
export const TIER_DEPTH: Record<Tier, number> = {
  superstar: 3_000_000,
  established: 1_200_000,
  emerging: 400_000,
  dormant: 150_000,
};

/**
 * Hazard rate the *market* assumes, inferred from tier alone. Deliberately
 * distinct from each artist's hidden `hazardRate` — the gap between them is
 * the mispricing the run inspector exists to measure.
 */
export const TIER_HAZARD_EST: Record<Tier, number> = {
  superstar: 0.0006,
  established: 0.0025,
  emerging: 0.011,
  dormant: 0.026,
};

/** Prior annual growth by tier, used to shrink the noisy observed estimate. */
export const TIER_GROWTH_PRIOR: Record<Tier, number> = {
  superstar: 0.06,
  established: 0.12,
  emerging: 0.35,
  dormant: -0.15,
};

export const STARTING_CREDITS = 100_000;

/** Concentration warning threshold for the portfolio view. */
export const CONCENTRATION_LIMIT = 0.2;

export const EVENT_KINDS = [
  "sync",
  "playlist",
  "viral",
  "labeldrop",
  "breakout",
  "exit",
  "offering",
  "payout",
  "capraise",
  "debut",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_LABEL: Record<string, string> = {
  sync: "SYNC",
  playlist: "PLAYLIST",
  viral: "VIRAL",
  labeldrop: "LABEL DROP",
  breakout: "BREAKOUT",
  exit: "EXIT",
  offering: "OFFERING",
  payout: "PAYOUT",
  capraise: "CAP RAISE",
  debut: "DEBUT",
};
