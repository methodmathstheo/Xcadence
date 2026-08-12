"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clockAction, useMarket } from "@/lib/client/useMarket";
import { fmtSimDate, fmtClock, SPEEDS, SPEED_LABELS } from "@/lib/sim/time";

const JUMPS: [string, number][] = [
  ["+1d", 1],
  ["+1w", 7],
  ["+1m", 30],
  ["+1y", 365],
];

/**
 * The clock is the venue's, not the browser's. These controls tell the server
 * what to do; the header then reflects whatever the server is actually doing.
 */
export function ClockBar() {
  const m = useMarket();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [pending, setPending] = useState<string | null>(null);
  const [seed, setSeed] = useState("");
  const [showReset, setShowReset] = useState(false);

  const run = async (body: Record<string, unknown>, tag: string) => {
    setPending(tag);
    try {
      await clockAction(body);
      startTransition(() => router.refresh());
    } finally {
      setPending(null);
    }
  };

  const simMs = m.clock.simMs;
  const live = m.connected;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel px-4 py-2">
      <div className="flex items-baseline gap-3">
        <span className="label">Sim date</span>
        <span className="num text-base text-fg">{simMs ? fmtSimDate(simMs) : "—"}</span>
        <span className="num text-xs text-fg-mute">{simMs ? fmtClock(simMs) : ""}</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => run({ action: m.clock.running ? "pause" : "play" }, "run")}
          disabled={pending !== null}
          className="border border-line-2 px-3 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-40"
        >
          {m.clock.running ? "❙❙ Pause" : "▶ Play"}
        </button>

        <select
          value={m.clock.speed}
          onChange={(e) => run({ action: "speed", speed: Number(e.target.value) }, "speed")}
          disabled={pending !== null}
          className="border border-line-2 bg-panel-2 px-2 py-1 num text-xs text-fg-dim hover:border-line-2 focus:outline-none"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {SPEED_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <span className="label mr-1">Jump</span>
        {JUMPS.map(([label, days]) => (
          <button
            key={label}
            onClick={() => run({ action: "jump", days }, label)}
            disabled={pending !== null}
            className="num border border-line-2 px-2 py-1 text-xs text-fg-dim hover:border-cyan hover:text-cyan disabled:opacity-40"
          >
            {pending === label ? "…" : label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="num text-xs text-fg-mute">tick {m.clock.tick.toLocaleString()}</span>
        <span className="flex items-center gap-1.5 text-xs">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              live && m.clock.running
                ? "bg-up pulse-dot"
                : live
                  ? "bg-accent"
                  : "bg-down"
            }`}
          />
          <span className="label">
            {!live ? "Disconnected" : m.clock.running ? "Live" : "Paused"}
          </span>
        </span>

        {showReset ? (
          <span className="flex items-center gap-1">
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="seed"
              className="num w-24 border border-line-2 bg-panel-2 px-2 py-1 text-xs focus:border-accent focus:outline-none"
            />
            <button
              onClick={async () => {
                await run({ action: "reset", seed: Number(seed) || undefined }, "reset");
                setShowReset(false);
              }}
              disabled={pending !== null}
              className="border border-down px-2 py-1 text-xs text-down hover:bg-down/10 disabled:opacity-40"
            >
              {pending === "reset" ? "Rebuilding…" : "Confirm"}
            </button>
            <button
              onClick={() => setShowReset(false)}
              className="px-1 py-1 text-xs text-fg-mute hover:text-fg"
            >
              ✕
            </button>
          </span>
        ) : (
          <button
            onClick={() => setShowReset(true)}
            disabled={busy}
            className="label border border-line-2 px-2 py-1 hover:border-down hover:text-down"
          >
            Reset to seed
          </button>
        )}
      </div>
    </div>
  );
}
