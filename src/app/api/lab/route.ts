import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { engine } from "@/lib/engine/engine";
import { dcf, discountSensitivity, estimateInputs } from "@/lib/quant/dcf";
import { monteCarlo } from "@/lib/quant/montecarlo";
import { kaplanMeierByGroup, type SurvivalSubject } from "@/lib/quant/survival";
import {
  diversification, survivorship, toReturns, type CohortMember,
} from "@/lib/quant/cohort";
import { adverseSelection } from "@/lib/quant/adverse";
import { monthKey, monthKeyToMs, MS_DAY } from "@/lib/sim/time";
import { TIER_HAZARD_EST, type Tier } from "@/lib/sim/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const tool = String(body?.tool ?? "");
  const w = await engine.ensureLoaded();

  switch (tool) {
    // ------------------------------------------------------------------ DCF
    case "dcf": {
      const a = w.artists.get(Number(body.artistId));
      if (!a) return NextResponse.json({ error: "no such artist" }, { status: 404 });
      const rate = clampRate(body.discount);
      const inputs = estimateInputs(a, rate);
      const result = dcf(inputs);
      const sens = discountSensitivity(inputs);
      return NextResponse.json({
        artist: pub(a),
        result: {
          pv: result.pv,
          perContract: result.pvPerContract,
          impliedMultiple: result.impliedMultiple,
          annualRoyalty: result.annualRoyalty,
          frontLoad: result.frontLoad,
          inputs: result.inputs,
          rows: result.rows.filter((r) => r.month % 3 === 0),
        },
        sensitivity: sens.curve,
        halvingRate: sens.halvingRate,
        marketPrice: a.price,
        divergence: result.pvPerContract > 0 ? a.price / result.pvPerContract - 1 : 0,
      });
    }

    // ---------------------------------------------------------- Monte Carlo
    case "montecarlo": {
      const a = w.artists.get(Number(body.artistId));
      if (!a) return NextResponse.json({ error: "no such artist" }, { status: 404 });
      const rate = clampRate(body.discount);
      const inputs = estimateInputs(a, rate);
      const horizon = 120;
      const result = monteCarlo({
        monthlyRoyalty: inputs.monthlyRoyalty,
        growthAnnual: inputs.growthAnnual,
        volAnnual: Math.max(0.15, a.volatility),
        hazardMonthly: inputs.hazardMonthly,
        discountAnnual: rate,
        horizonMonths: horizon,
        breakoutMonthly: 0.006,
        paths: Math.min(20_000, Math.max(1_000, Number(body.paths) || 10_000)),
        seed: w.seed + a.id,
        cost: a.price * a.unitScale,
      });
      return NextResponse.json({
        artist: pub(a),
        unitScale: a.unitScale,
        marketCapImplied: a.price * a.unitScale,
        result,
      });
    }

    // ------------------------------------------------------------- survival
    case "survival": {
      const artists = await prisma.artist.findMany({
        where: { runId: w.runId },
        select: { debutMs: true, exitMs: true, active: true, debutTier: true },
      });
      const subjects: SurvivalSubject[] = artists.map((a) => ({
        duration: Math.max(0, ((a.exitMs ?? w.simMs) - a.debutMs) / (MS_DAY * 30.44)),
        event: !a.active,
        group: a.debutTier,
      }));
      return NextResponse.json({
        curves: kaplanMeierByGroup(subjects),
        overall: kaplanMeierByGroup(subjects.map((s) => ({ ...s, group: "all" })))[0],
        n: subjects.length,
      });
    }

    // -------------------------------------------------------- survivorship
    case "survivorship": {
      const months = Math.min(120, Math.max(3, Number(body.months) || 24));
      const entryKey = monthKey(w.simMs) - months;
      const entryMs = monthKeyToMs(entryKey);

      const entries = await prisma.pricePoint.findMany({
        where: { tMs: entryMs, artist: { runId: w.runId } },
        select: {
          price: true,
          artistId: true,
          artist: { select: { name: true, debutTier: true, active: true } },
        },
      });
      if (entries.length === 0) {
        return NextResponse.json({
          error: `No price snapshot at ${months} months back — the run has not been going that long.`,
        }, { status: 400 });
      }

      const members: CohortMember[] = entries
        .filter((e) => e.price > 0)
        .map((e) => {
          const live = w.artists.get(e.artistId);
          const survived = !!live?.active;
          // A delisted artist's contract pays nothing. That zero is the entire
          // difference between the two columns.
          const exitPrice = survived ? live!.price : 0;
          return {
            artistId: e.artistId,
            name: e.artist.name,
            debutTier: e.artist.debutTier,
            entryPrice: e.price,
            exitPrice,
            survived,
            ret: exitPrice / e.price - 1,
          };
        });

      return NextResponse.json(survivorship(members, months));
    }

    // ----------------------------------------------------- diversification
    case "diversification": {
      let ids: number[] = Array.isArray(body.artistIds) ? body.artistIds.map(Number) : [];
      if (ids.length < 2) {
        ids = [...w.positions.entries()]
          .filter(([, p]) => Math.abs(p.qty) > 1e-9)
          .map(([id]) => id);
      }
      if (ids.length < 2) {
        // No book yet: fall back to a readable slice of the live universe so
        // the tool still demonstrates the shape.
        ids = w.order.filter((id) => w.artists.get(id)!.active).slice(0, 14);
      }
      ids = ids.slice(0, 24);

      const points = await prisma.pricePoint.findMany({
        where: { artistId: { in: ids } },
        orderBy: { tMs: "asc" },
        select: { artistId: true, tMs: true, price: true },
      });

      // One observation per simulated month. PricePoint also carries a row for
      // every user trade, and mixing intra-month prints with month closes makes
      // the return series a function of when someone happened to trade.
      const byArtist = new Map<number, Map<number, number>>();
      for (const p of points) {
        const m = byArtist.get(p.artistId) ?? new Map<number, number>();
        m.set(monthKey(p.tMs), p.price);
        byArtist.set(p.artistId, m);
      }
      const closes = new Map<number, number[]>();
      for (const [id, m] of byArtist) {
        closes.set(id, [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v));
      }

      const series = ids
        .map((id) => ({
          artistId: id,
          name: w.artists.get(id)?.name ?? `#${id}`,
          returns: toReturns(closes.get(id) ?? []),
        }))
        .filter((s) => s.returns.length >= 4);

      if (series.length < 2) {
        return NextResponse.json({
          error: "Not enough monthly price history yet. Advance the clock a few months.",
        }, { status: 400 });
      }
      return NextResponse.json(diversification(series));
    }

    // -------------------------------------------------- adverse selection
    case "adverse": {
      const artists = [...w.artists.values()].filter((a) => a.active);
      return NextResponse.json(
        adverseSelection(artists, {
          informationAdvantage: num(body.informationAdvantage, 0, 1, 0.7),
          offerPrice: num(body.offerPrice, 0.05, 3, 1),
          rounds: Math.min(12, Math.max(1, Number(body.rounds) || 6)),
          seed: w.seed,
        }),
      );
    }

    default:
      return NextResponse.json({ error: `unknown tool: ${tool}` }, { status: 400 });
  }
}

/** Public projection. Nothing hidden crosses this boundary. */
function pub(a: {
  id: number; name: string; tier: string; listeners: number; royaltyRate: number;
  volatility: number; price: number; unitScale: number;
}) {
  return {
    id: a.id,
    name: a.name,
    tier: a.tier,
    listeners: a.listeners,
    monthlyRoyalty: a.listeners * a.royaltyRate,
    volatility: a.volatility,
    price: a.price,
    unitScale: a.unitScale,
    hazardAssumed: TIER_HAZARD_EST[a.tier as Tier] ?? 0.01,
  };
}

function clampRate(x: unknown): number {
  const r = Number(x);
  return Number.isFinite(r) ? Math.min(0.3, Math.max(0.05, r)) : 0.14;
}

function num(x: unknown, lo: number, hi: number, dflt: number): number {
  const v = Number(x);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
}
