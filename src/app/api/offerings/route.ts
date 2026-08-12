import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { engine } from "@/lib/engine/engine";
import { annualise, irrMonthly } from "@/lib/engine/offerings";
import { dcf, estimateInputs } from "@/lib/quant/dcf";
import { monthKey } from "@/lib/sim/time";
import { cohortStats } from "@/lib/quant/cohort";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const w = await engine.ensureLoaded();
  const nowKey = monthKey(w.simMs);

  const open = w.offerings
    .filter((o) => o.status === "OPEN")
    .map((o) => {
      const a = w.artists.get(o.artistId);
      if (!a) return null;
      const est = estimateInputs(a);
      const naive = dcf({
        ...est,
        monthlyRoyalty: est.monthlyRoyalty * o.pctRoyalty,
        horizonMonths: o.termMonths,
      });
      return {
        id: o.id,
        artistId: o.artistId,
        artistName: a.name,
        tier: a.tier,
        genre: a.genre,
        listeners: a.listeners,
        monthlyRoyalty: a.listeners * a.royaltyRate,
        pctRoyalty: o.pctRoyalty,
        askCredits: o.askCredits,
        termMonths: o.termMonths,
        filled: o.filled,
        remaining: Math.max(0, o.askCredits - o.filled),
        expiresMs: o.expiresMs,
        /** What the naive model says the slice is worth over the term. */
        modelValue: naive.pv,
        /** Above 1 means you are paying more than the naive model's number. */
        priceToModel: naive.pv > 0 ? o.askCredits / naive.pv : 0,
      };
    })
    .filter(Boolean);

  // ---- the user's positions, with payment history for IRR
  const rows = await prisma.offeringPosition.findMany({
    where: { runId: w.runId },
    include: {
      offering: { select: { artistId: true, pctRoyalty: true, termMonths: true, artist: { select: { name: true, active: true } } } },
      payments: { orderBy: { monthKey: "asc" }, select: { monthKey: true, amount: true } },
    },
    orderBy: { id: "desc" },
  });

  const positions = rows.map((p) => {
    const live = w.offeringPositions.find((x) => x.id === p.id);
    const royalties = live?.royalties ?? p.royalties;
    const monthsPaid = live?.monthsPaid ?? p.monthsPaid;
    const active = live?.active ?? p.active;
    const term = p.endMonthKey - p.startMonthKey;

    // Cash flows: capital out at t0, then each month's receipt.
    const flows: number[] = [-p.credits];
    const byMonth = new Map(p.payments.map((x) => [x.monthKey, x.amount]));
    for (let m = 1; m <= Math.max(monthsPaid, 1); m++) {
      flows.push(byMonth.get(p.startMonthKey + m) ?? 0);
    }
    const irr = annualise(irrMonthly(flows));

    const artist = w.artists.get(p.offering.artistId);
    const monthsLeft = active ? Math.max(0, p.endMonthKey - nowKey) : 0;
    // Straight-line projection off the current run rate. Deliberately naive,
    // and labelled as such in the UI.
    const runRate = monthsPaid > 0 ? royalties / monthsPaid : 0;
    const projectedTotal = royalties + runRate * monthsLeft;

    return {
      id: p.id,
      offeringId: p.offeringId,
      artistId: p.offering.artistId,
      artistName: p.offering.artist.name,
      artistActive: !!artist?.active,
      credits: p.credits,
      sharePct: p.sharePct,
      pctRoyalty: p.offering.pctRoyalty,
      termMonths: term,
      monthsPaid,
      monthsLeft,
      royalties,
      active,
      multiple: p.credits > 0 ? royalties / p.credits : 0,
      ret: p.credits > 0 ? royalties / p.credits - 1 : 0,
      irr,
      projectedTotal,
      projectedReturn: p.credits > 0 ? projectedTotal / p.credits - 1 : 0,
      payments: p.payments,
    };
  });

  // ---- cohort: every offering ever taken in this run
  const closed = positions.filter((p) => !p.active);
  const all = positions;
  const cohort = {
    taken: all.length,
    closed: closed.length,
    deployed: all.reduce((s, p) => s + p.credits, 0),
    received: all.reduce((s, p) => s + p.royalties, 0),
    stats: cohortStats(all.map((p) => p.ret)),
    closedStats: cohortStats(closed.map((p) => p.ret)),
    // Deliberately reported alongside the median: on this distribution they
    // are different questions and only one of them describes a typical result.
    shareBelowCost: all.length
      ? all.filter((p) => p.ret < 0).length / all.length
      : 0,
    histogram: histogram(all.map((p) => p.ret)),
  };

  return NextResponse.json({
    simMs: w.simMs,
    cash: w.account.cash,
    open,
    positions,
    cohort,
  });
}

/** Allocate credits to an open offering. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const offeringId = Number(body?.offeringId);
  const credits = Number(body?.credits);

  const w = await engine.ensureLoaded();
  const o = w.offerings.find((x) => x.id === offeringId);
  if (!o) return NextResponse.json({ error: "no such offering" }, { status: 404 });
  if (o.status !== "OPEN") return NextResponse.json({ error: "offering is closed" }, { status: 400 });

  const remaining = Math.max(0, o.askCredits - o.filled);
  const amount = Math.min(credits, remaining, w.account.cash);
  if (!(amount > 0)) {
    return NextResponse.json({ error: "nothing to allocate" }, { status: 400 });
  }

  const artist = w.artists.get(o.artistId);
  if (!artist?.active) {
    return NextResponse.json({ error: "artist is no longer listed" }, { status: 400 });
  }

  // Your share of the artist's royalty stream is your share of the raise,
  // scaled by the fraction of royalties on offer.
  const sharePct = (amount / o.askCredits) * o.pctRoyalty;
  const startMonthKey = monthKey(w.simMs);

  const created = await prisma.offeringPosition.create({
    data: {
      runId: w.runId,
      offeringId: o.id,
      credits: amount,
      sharePct,
      startMonthKey,
      endMonthKey: startMonthKey + o.termMonths,
      royalties: 0,
      monthsPaid: 0,
      active: true,
    },
  });

  w.account.cash -= amount;
  o.filled = Math.min(o.askCredits, o.filled + amount);
  if (o.filled >= o.askCredits * 0.999) o.status = "FILLED";
  w.pending.offeringUpdates.push(o);
  w.offeringPositions.push({
    id: created.id,
    offeringId: o.id,
    artistId: o.artistId,
    credits: amount,
    sharePct,
    startMonthKey,
    endMonthKey: startMonthKey + o.termMonths,
    royalties: 0,
    monthsPaid: 0,
    active: true,
  });

  await engine.flush();
  return NextResponse.json({ ok: true, allocated: amount, sharePct, cash: w.account.cash });
}

function histogram(returns: number[]) {
  if (returns.length === 0) return [];
  const buckets = [
    [-1.001, -0.999, "total loss"],
    [-0.999, -0.5, "−100% to −50%"],
    [-0.5, -0.25, "−50% to −25%"],
    [-0.25, 0, "−25% to 0%"],
    [0, 0.5, "0% to +50%"],
    [0.5, 2, "+50% to +200%"],
    [2, 10, "+200% to +1000%"],
    [10, Infinity, "over +1000%"],
  ] as const;
  return buckets.map(([lo, hi, label]) => ({
    label,
    count: returns.filter((r) => r >= lo && r < hi).length,
  }));
}
