import { NextResponse } from "next/server";
import { engine } from "@/lib/engine/engine";
import { SimulatedDataProvider } from "@/lib/data/simulated";
import { dcf, estimateInputs } from "@/lib/quant/dcf";
import { categoryOf, genreFor } from "@/lib/sim/names";
import type { ArtistSummary } from "@/lib/data/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Universe snapshot. Served from the engine's live world when it is loaded so
 * a page never opens on values that are already a few seconds stale.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("inactive") === "1";
  const lite = url.searchParams.get("lite") === "1";

  const w = await engine.ensureLoaded();
  const rows: ArtistSummary[] = [];
  for (const id of w.order) {
    const a = w.artists.get(id)!;
    if (!a.active && !includeInactive) continue;
    // Same estimator the artist page and the fundamental bots use: observable
    // inputs and a tier-inferred hazard. Never the artist's real parameters.
    const fairValue = dcf(estimateInputs(a)).pvPerContract;
    rows.push({
      id: a.id,
      name: a.name,
      genre: genreFor(a.name),
      category: categoryOf(a.name),
      tier: a.tier,
      active: a.active,
      debutMs: a.debutMs,
      exitMs: a.exitMs,
      exitReason: a.exitReason,
      rank: 0,
      listeners: a.listeners,
      growth30: a.listeners30 > 0 ? a.listeners / a.listeners30 - 1 : 0,
      growth90: a.listeners90 > 0 ? a.listeners / a.listeners90 - 1 : 0,
      volatility: a.volatility,
      royaltyRate: a.royaltyRate,
      monthlyRoyalty: a.listeners * a.royaltyRate,
      price: a.price,
      prevPrice: a.prevPrice,
      q: a.q,
      b: a.b,
      vMax: a.vMax,
      unitScale: a.unitScale,
      fairValue,
      divergence: fairValue > 0 ? a.price / fairValue - 1 : 0,
    });
  }

  rows.sort((x, y) => y.listeners - x.listeners);
  rows.forEach((r, i) => (r.rank = i + 1));

  if (lite) {
    return NextResponse.json({
      artists: rows.map((r) => ({ id: r.id, name: r.name, tier: r.tier, price: r.price })),
    });
  }
  return NextResponse.json({ artists: rows, simMs: w.simMs });
}

/** Kept so the provider seam is exercised rather than merely declared. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const w = await engine.ensureLoaded();
  const provider = new SimulatedDataProvider(w.runId);
  if (body?.what === "chart") {
    return NextResponse.json({
      rows: await provider.getChartSnapshot(Number(body.dateMs) || w.simMs),
    });
  }
  return NextResponse.json({ error: "unknown request" }, { status: 400 });
}
