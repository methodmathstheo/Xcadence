"use client";

import { useMemo } from "react";
import { useMarket } from "@/lib/client/useMarket";
import { ArtistLink, Empty } from "@/components/ui";
import { fmtCredits, fmtSignedPct } from "@/lib/format";
import type { ArtistSummary } from "@/lib/data/provider";

/**
 * Movers, recomputed every tick. Measured against the previous quote rather
 * than a session open, so this board answers "what is moving right now".
 */
export function Movers({ rows }: { rows: ArtistSummary[] }) {
  const m = useMarket();

  const { up, down } = useMemo(() => {
    const scored = rows
      .map((a) => {
        const q = m.quote(a.id, a.price, a.listeners);
        return { id: a.id, name: a.name, price: q.price, chg: q.prev > 0 ? q.price / q.prev - 1 : 0 };
      })
      .filter((r) => r.chg !== 0);
    scored.sort((a, b) => b.chg - a.chg);
    return { up: scored.slice(0, 8), down: scored.slice(-8).reverse() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, m.version]);

  if (up.length === 0) return <Empty>No movement this tick</Empty>;

  return (
    <div className="grid grid-cols-2 gap-px bg-line">
      <List title="Gainers" rows={up} tone="text-up" />
      <List title="Losers" rows={down} tone="text-down" />
    </div>
  );
}

function List({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: { id: number; name: string; price: number; chg: number }[];
  tone: string;
}) {
  return (
    <div className="bg-panel">
      <div className="label border-b border-line px-3 py-1.5">{title}</div>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className="flex items-baseline gap-2 px-3 py-1.5 text-xs">
            <ArtistLink id={r.id} name={r.name} className="truncate text-fg-dim" />
            <span className="num ml-auto shrink-0 text-fg-mute">{fmtCredits(r.price)}</span>
            <span className={`num w-16 shrink-0 text-right ${tone}`}>
              {fmtSignedPct(r.chg, 2)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
