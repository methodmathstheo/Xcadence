import { NextResponse } from "next/server";
import { getOrCreateRun, DEFAULT_SEED } from "@/lib/sim/run";
import { engine } from "@/lib/engine/engine";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const run = await getOrCreateRun();
  const [artists, active, months, events] = await Promise.all([
    prisma.artist.count({ where: { runId: run.id } }),
    prisma.artist.count({ where: { runId: run.id, active: true } }),
    prisma.artistMonth.count({ where: { artist: { runId: run.id } } }),
    prisma.marketEvent.count({ where: { runId: run.id } }),
  ]);
  return NextResponse.json({ run, counts: { artists, active, months, events } });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const seed = Number.isFinite(Number(body?.seed)) ? Number(body.seed) : DEFAULT_SEED;
  // Always reseed through the engine. Replacing the run underneath a loaded
  // world orphans it — the clock keeps ticking against a deleted run and every
  // flush fails silently.
  const w = await engine.reset(seed);
  return NextResponse.json({ run: { id: w.runId, seed: w.seed, simMs: w.simMs } });
}
