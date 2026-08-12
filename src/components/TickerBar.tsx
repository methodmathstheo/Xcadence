"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMarket } from "@/lib/client/useMarket";
import { useAvatars } from "@/lib/client/useAvatars";
import { Avatar } from "@/components/Avatar";
import { fmtCredits, fmtSignedPct } from "@/lib/format";

type Lite = { id: number; name: string; tier: string; price: number };

/**
 * Runs across the top of every page: both index variants, then a marquee of
 * the markets that have moved furthest since the previous quote.
 */
export function TickerBar() {
  const m = useMarket();
  const { avatars } = useAvatars();
  const [names, setNames] = useState<Map<number, Lite>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/artists?lite=1")
      .then((r) => r.json())
      .then((d: { artists: Lite[] }) => {
        if (!cancelled) setNames(new Map(d.artists.map((a) => [a.id, a])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => {
    const rows: { id: number; name: string; price: number; chg: number }[] = [];
    for (const [id, q] of m.quotes) {
      const meta = names.get(id);
      if (!meta || q.prev <= 0) continue;
      rows.push({ id, name: meta.name, price: q.price, chg: q.price / q.prev - 1 });
    }
    rows.sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg));
    return rows.slice(0, 28);
    // Recomputed once per frame; m.version is the frame counter.
  }, [m.version, names]);

  const strip = items.length ? [...items, ...items] : [];

  return (
    <div className="flex items-stretch overflow-hidden border-b border-line bg-panel-2 text-xs">
      <div className="flex shrink-0 items-center gap-4 border-r border-line px-4 py-1.5">
        <IndexChip label="EAI·EW" value={m.index.equal} />
        <IndexChip label="EAI·LW" value={m.index.weighted} />
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        {strip.length === 0 ? (
          <div className="px-4 py-1.5 label">Awaiting order flow…</div>
        ) : (
          <div className="marquee flex w-max items-center gap-6 py-1.5 pl-4">
            {strip.map((it, i) => (
              <Link
                key={`${it.id}-${i}`}
                href={`/artist/${it.id}`}
                className="flex shrink-0 items-center gap-2 hover:opacity-80"
              >
                <Avatar name={it.name} src={avatars[it.id]} size={16} />
                <span className="text-fg-dim">{it.name}</span>
                <span className="num text-fg">{fmtCredits(it.price)}</span>
                <span className={`num ${it.chg > 0 ? "text-up" : it.chg < 0 ? "text-down" : "text-fg-mute"}`}>
                  {fmtSignedPct(it.chg, 2)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IndexChip({ label, value }: { label: string; value: number }) {
  const off = value - 100;
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="label">{label}</span>
      <span className="num text-fg">{fmtCredits(value)}</span>
      <span className={`num text-xs ${off > 0 ? "text-up" : off < 0 ? "text-down" : "text-fg-mute"}`}>
        {fmtSignedPct(off / 100, 2)}
      </span>
    </span>
  );
}
