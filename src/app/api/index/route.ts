import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { engine } from "@/lib/engine/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Persisted Emerging Artist Index history, one point per simulated month. */
export async function GET() {
  const w = await engine.ensureLoaded();
  const points = await prisma.indexPoint.findMany({
    where: { runId: w.runId },
    orderBy: { tMs: "asc" },
    take: 600,
    select: { tMs: true, equal: true, weighted: true },
  });
  return NextResponse.json({ points, live: { tMs: w.simMs, ...w.index } });
}
