import { NextResponse } from "next/server";
import { engine } from "@/lib/engine/engine";
import { DEFAULT_SEED } from "@/lib/sim/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const w = await engine.ensureLoaded();
  return NextResponse.json({
    simMs: w.simMs,
    startMs: w.startMs,
    speed: w.speed,
    running: w.running,
    tick: w.tick,
    seed: w.seed,
  });
}

/**
 * Clock control surface: play, pause, speed, jump forward, reset to seed.
 * `reset` rebuilds the universe from the given seed and discards the run.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  let w;
  switch (action) {
    case "play":
      w = await engine.setRunning(true);
      break;
    case "pause":
      w = await engine.setRunning(false);
      break;
    case "speed":
      w = await engine.setSpeed(Number(body.speed));
      break;
    case "jump":
      w = await engine.jump(Number(body.days) || 1);
      break;
    case "reset":
      w = await engine.reset(
        Number.isFinite(Number(body.seed)) ? Number(body.seed) : DEFAULT_SEED,
      );
      break;
    default:
      return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
  }

  return NextResponse.json({
    simMs: w.simMs,
    speed: w.speed,
    running: w.running,
    tick: w.tick,
    seed: w.seed,
  });
}
