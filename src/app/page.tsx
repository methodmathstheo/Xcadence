"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMarket } from "@/lib/client/useMarket";
import { LiveCell } from "@/components/LiveCell";
import { fmtCredits, fmtListeners, fmtSignedPct } from "@/lib/format";
import { fmtSimDateTime, SPEED_LABELS } from "@/lib/sim/time";
import type { ArtistSummary } from "@/lib/data/provider";

/**
 * Stage 2 placeholder. Proves the clock: simulated time advances on the
 * server, fundamentals move with it, and the browser sees it live. The full
 * rankings table, movers board and index charts land in stage 3.
 */
export default function Home() {
  const m = useMarket();
  const [rows, setRows] = useState<ArtistSummary[]>([]);

  useEffect(() => {
    fetch("/api/artists")
      .then((r) => r.json())
      .then((d: { artists: ArtistSummary[] }) => setRows(d.artists.slice(0, 25)))
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
        <Stat label="Simulated now" value={m.clock.simMs ? fmtSimDateTime(m.clock.simMs) : "—"} />
        <Stat label="Acceleration" value={SPEED_LABELS[m.clock.speed] ?? `${m.clock.speed}×`} />
        <Stat label="Ticks elapsed" value={m.clock.tick.toLocaleString()} />
        <Stat label="Credits" value={fmtCredits(m.account.cash)} />
      </div>

      <h2 className="label mb-2">Universe · top 25 by monthly listeners</h2>
      <div className="panel overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line text-left">
              <Th className="w-12">#</Th>
              <Th>Artist</Th>
              <Th>Tier</Th>
              <Th className="text-right">Monthly listeners</Th>
              <Th className="text-right">30d</Th>
              <Th className="text-right">Price</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => {
              const q = m.quote(a.id, a.price, a.listeners);
              return (
                <tr key={a.id} className="border-b border-line/60 hover:bg-panel-2">
                  <td className="num px-3 py-1.5 text-fg-mute">{i + 1}</td>
                  <td className="px-3 py-1.5">
                    <Link href={`/artist/${a.id}`} className="hover:text-accent">
                      {a.name}
                    </Link>
                    <span className="ml-2 text-fg-mute">{a.genre}</span>
                  </td>
                  <td className="label px-3 py-1.5">{a.tier}</td>
                  <td className="px-3 py-1.5 text-right">
                    <LiveCell value={q.listeners || a.listeners} render={fmtListeners} />
                  </td>
                  <td className="num px-3 py-1.5 text-right text-fg-dim">
                    {fmtSignedPct(a.growth30)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <LiveCell value={q.price} render={(v) => fmtCredits(v)} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center label">
                  Loading universe…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 max-w-2xl text-xs leading-relaxed text-fg-mute">
        Quotes hold still until stage 4 wires the synthetic participants into the
        AMM — nothing is pushing <span className="num">q</span> yet. Listener counts
        are already advancing on the server clock, which is what this stage exists
        to demonstrate.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel px-3 py-2">
      <div className="label">{label}</div>
      <div className="num mt-0.5 text-sm text-fg">{value}</div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`label px-3 py-2 font-normal ${className}`}>{children}</th>;
}
