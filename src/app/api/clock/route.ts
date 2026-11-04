import { NextResponse } from "next/server";
import { engine } from "@/lib/engine/engine";
import { DEFAULT_SEED } from "@/lib/sim/run";
import { currentUser } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/owner";
import { limited, readJson } from "@/lib/http/limits";

/** The largest jump the clock bar offers. */
const MAX_JUMP_DAYS = 365;

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
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const action = String(body?.action ?? "");

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // The clock is shared, so one visitor leaning on it is everyone's problem:
  // a jump advances every market, and twenty a minute is plenty for a person.
  const slow = limited(req, "clock");
  if (slow) return slow;

  // Reset discards every account's book, so it is the owner's alone. The rest
  // of the clock is shared and reversible.
  if (action === "reset" && !(await isOwner(user))) {
    return NextResponse.json(
      { error: "Only the venue owner can reseed the run." },
      { status: 403 },
    );
  }

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
      // The controls offer a year at most; anything larger is not a person.
      w = await engine.jump(Math.min(MAX_JUMP_DAYS, Math.max(1, Number(body.days) || 1)));
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
