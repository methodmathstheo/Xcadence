import type { RNG } from "@/lib/rng";
import { dcf, estimateInputs } from "@/lib/quant/dcf";
import { monthKey, MS_DAY } from "@/lib/sim/time";
import { pushEvent } from "@/lib/engine/tape";
import type { World } from "@/lib/engine/types";

/**
 * The primary market.
 *
 * An emerging artist sells a slice of future royalties for credits up front.
 * The engine then pays that slice, month by simulated month, along whatever
 * path the artist actually takes. Most of these lose money and a few pay off
 * enormously, and that is not a thumb on the scale: offerings are priced off
 * the market's tier-based hazard estimate, while the artist's real hazard is
 * drawn per artist. Sellers who are worse than they look are systematically
 * happy to sell at that price. The skew falls out of the same adverse
 * selection the lab lets you dial directly.
 */

export interface OfferingState {
  id: number;
  artistId: number;
  pctRoyalty: number;
  askCredits: number;
  termMonths: number;
  openMs: number;
  expiresMs: number;
  status: string;
  filled: number;
}

export interface OfferingPositionState {
  id: number;
  offeringId: number;
  artistId: number;
  credits: number;
  sharePct: number;
  startMonthKey: number;
  endMonthKey: number;
  royalties: number;
  monthsPaid: number;
  active: boolean;
}

/** Open offerings the venue tries to keep listed at once. */
const TARGET_OPEN = 12;
/** Ceiling on how much of a raise synthetic demand will take. */
const SYNTHETIC_FILL_CAP = 0.7;

/**
 * Pay one simulated month of royalties into every open position.
 *
 * A position stops paying when its term runs out *or* when the artist stops
 * being commercially active — that second case is where most of the losses
 * come from, and it is why the cohort view exists.
 */
export function accrueRoyalties(w: World, mk: number, tMs: number): void {
  let paid = 0;
  let closed = 0;

  for (const pos of w.offeringPositions) {
    if (!pos.active) continue;
    const artist = w.artists.get(pos.artistId);

    if (!artist || !artist.active) {
      pos.active = false;
      closed++;
      w.pending.offeringPositionUpdates.push(pos);
      continue;
    }

    const amount = artist.listeners * artist.royaltyRate * pos.sharePct;
    if (amount > 0) {
      w.account.cash += amount;
      pos.royalties += amount;
      paid += amount;
      w.pending.royaltyPayments.push({
        positionId: pos.id,
        monthKey: mk,
        dateMs: tMs,
        amount,
      });
    }

    pos.monthsPaid += 1;
    if (mk >= pos.endMonthKey || pos.monthsPaid >= termOf(pos)) {
      pos.active = false;
      closed++;
    }
    w.pending.offeringPositionUpdates.push(pos);
  }

  if (paid > 0) {
    pushEvent(w, {
      artistId: null,
      kind: "payout",
      magnitude: paid,
      headline: `Royalty settlement — ${paid.toFixed(2)} credits across ${
        w.offeringPositions.filter((p) => p.active).length + closed
      } positions`,
    });
  }
}

function termOf(pos: OfferingPositionState): number {
  return Math.max(1, pos.endMonthKey - pos.startMonthKey);
}

/**
 * Expire stale offerings, let synthetic demand take up part of the book, and
 * list new ones so there is always something on the primary market.
 */
export function refreshOfferings(w: World, rng: RNG, tMs: number): void {
  for (const o of w.offerings) {
    if (o.status !== "OPEN") continue;

    if (tMs >= o.expiresMs) {
      o.status = o.filled >= o.askCredits * 0.999 ? "FILLED" : "EXPIRED";
      w.pending.offeringUpdates.push(o);
      continue;
    }

    const artist = w.artists.get(o.artistId);
    if (!artist || !artist.active) {
      o.status = "CLOSED";
      w.pending.offeringUpdates.push(o);
      continue;
    }

    // Other investors take part of the book while it is open, so an offering
    // the user ignores does not sit untouched. Capped well short of the full
    // raise: at a faster rate synthetic demand filled every listing within
    // about two simulated months, which at 1440x is two minutes of wall time,
    // and the user never got to participate in the primary market at all.
    const r = rng.fork("fill", o.id);
    if (r.bool(0.25)) {
      o.filled = Math.min(
        o.askCredits * SYNTHETIC_FILL_CAP,
        o.filled + o.askCredits * r.uniform(0.01, 0.08),
      );
      w.pending.offeringUpdates.push(o);
    }
  }

  const open = w.offerings.filter((o) => o.status === "OPEN").length;
  const wanted = Math.max(0, TARGET_OPEN - open);
  if (wanted === 0) return;

  const candidates = w.order
    .map((id) => w.artists.get(id)!)
    .filter((a) => a.active && (a.tier === "emerging" || a.tier === "dormant"));
  if (candidates.length === 0) return;

  const listings = Math.min(wanted, 1 + (rng.bool(0.5) ? 1 : 0));
  for (let i = 0; i < listings; i++) {
    const a = candidates[rng.int(0, candidates.length - 1)];
    const r = rng.fork("new", i, tMs);

    const pctRoyalty = r.uniform(0.02, 0.12);
    const termMonths = r.pick([36, 60, 84]);
    const est = estimateInputs(a);
    // Priced off the naive valuation — the tier hazard estimate, not the
    // artist's real one. That gap is the whole point.
    const naive = dcf({
      ...est,
      monthlyRoyalty: est.monthlyRoyalty * pctRoyalty,
      horizonMonths: termMonths,
    }).pv;

    w.pending.newOfferings.push({
      artistId: a.id,
      pctRoyalty,
      askCredits: Math.max(250, naive * r.uniform(0.8, 1.25)),
      termMonths,
      openMs: tMs,
      expiresMs: tMs + r.int(20, 75) * MS_DAY,
      status: "OPEN",
      filled: 0,
    });

    pushEvent(w, {
      artistId: a.id,
      kind: "offering",
      magnitude: pctRoyalty,
      headline: `${a.name} — offering ${(pctRoyalty * 100).toFixed(1)}% of royalties for ${termMonths} months`,
    });
  }
}

/** Internal rate of return, monthly cash flows, solved by bisection. */
export function irrMonthly(cashflows: number[]): number | null {
  const npv = (r: number) =>
    cashflows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + r, i), 0);

  let lo = -0.95;
  let hi = 2;
  if (npv(lo) * npv(hi) > 0) return null; // no sign change: no root in range

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function annualise(monthlyRate: number | null): number | null {
  return monthlyRate === null ? null : Math.pow(1 + monthlyRate, 12) - 1;
}

export { monthKey };
