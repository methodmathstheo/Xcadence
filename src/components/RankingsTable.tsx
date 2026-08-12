"use client";

import { useMemo, useState } from "react";
import { useMarket } from "@/lib/client/useMarket";
import { useAvatars } from "@/lib/client/useAvatars";
import { Avatar } from "@/components/Avatar";
import { LiveCell } from "@/components/LiveCell";
import { ArtistLink, Empty, TierBadge } from "@/components/ui";
import { fmtCredits, fmtListeners, fmtPct, fmtSignedPct, toneClass } from "@/lib/format";
import type { ArtistSummary } from "@/lib/data/provider";

type SortKey =
  | "rank" | "name" | "tier" | "listeners"
  | "growth30" | "growth90" | "volatility" | "price" | "chg";

type Col = {
  key: SortKey; label: string; align: "left" | "right"; w?: string; detail?: boolean;
};

/** `detail` columns are hidden until the reader asks for them. */
const COLUMNS: Col[] = [
  { key: "rank", label: "#", align: "right", w: "w-12" },
  { key: "name", label: "Artist", align: "left" },
  { key: "tier", label: "Tier", align: "left", w: "w-28" },
  { key: "listeners", label: "Monthly listeners", align: "right" },
  { key: "growth30", label: "30d", align: "right" },
  { key: "growth90", label: "90d", align: "right", detail: true },
  { key: "volatility", label: "Vol", align: "right", detail: true },
  { key: "price", label: "Price", align: "right" },
  { key: "chg", label: "Chg", align: "right" },
];

/**
 * Named rankings, each a (column, direction) pair.
 *
 * The numbered rank on the left is the row's position in whatever ranking is
 * currently applied, not a fixed popularity order — a rank column that keeps
 * saying "4" while you sort by growth is telling you about a different list
 * than the one you are reading.
 */
const PRESETS: { id: string; label: string; key: SortKey; dir: 1 | -1 }[] = [
  { id: "popular", label: "Most popular", key: "listeners", dir: 1 },
  { id: "growth", label: "Biggest growth", key: "growth30", dir: 1 },
  { id: "priceDesc", label: "Price high → low", key: "price", dir: 1 },
  { id: "priceAsc", label: "Price low → high", key: "price", dir: -1 },
];

const CHARTS: { id: "all" | "rap" | "rnb"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "rap", label: "Rap" },
  { id: "rnb", label: "R&B" },
];

export function RankingsTable({
  rows,
  defaultLimit = 120,
}: {
  rows: ArtistSummary[];
  defaultLimit?: number;
}) {
  const m = useMarket();
  const { avatars } = useAvatars();
  const [preset, setPreset] = useState("popular");
  const [sort, setSort] = useState<SortKey>("listeners");
  const [dir, setDir] = useState<1 | -1>(1);
  const [query, setQuery] = useState("");
  const [chart, setChart] = useState<"all" | "rap" | "rnb">("all");
  const [tier, setTier] = useState<string>("all");
  const [limit, setLimit] = useState(defaultLimit);
  const [detailed, setDetailed] = useState(false);

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    const live = rows.map((a) => {
      const quote = m.quote(a.id, a.price, a.listeners);
      const listeners = quote.listeners || a.listeners;
      return {
        ...a,
        listeners,
        price: quote.price,
        chg: quote.prev > 0 ? quote.price / quote.prev - 1 : 0,
        growth30: a.listeners > 0 ? (listeners / a.listeners) * (1 + a.growth30) - 1 : 0,
        growth90: a.listeners > 0 ? (listeners / a.listeners) * (1 + a.growth90) - 1 : 0,
      };
    });

    const filtered = live.filter(
      (a) =>
        (chart === "all" || a.category === chart) &&
        (tier === "all" || a.tier === tier) &&
        (!q || a.name.toLowerCase().includes(q) || a.genre.toLowerCase().includes(q)),
    );

    filtered.sort((x, y) => {
      const a = x[sort as keyof typeof x];
      const b = y[sort as keyof typeof y];
      if (typeof a === "string" && typeof b === "string") return dir * a.localeCompare(b);
      return dir * (Number(b) - Number(a));
    });
    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, dir, query, tier, chart, m.version]);

  const cols = useMemo(() => COLUMNS.filter((c) => detailed || !c.detail), [detailed]);

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setPreset(p.id);
    setSort(p.key);
    setDir(p.dir);
  };

  const click = (key: SortKey) => {
    setPreset("");
    if (key === sort) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSort(key);
      setDir(key === "name" ? -1 : 1);
    }
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <div className="flex gap-px bg-line">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              className={`px-2.5 py-1.5 text-[11px] ${
                preset === p.id ? "bg-panel text-accent" : "bg-panel-2 text-fg-mute hover:text-fg"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex gap-px bg-line">
          {CHARTS.map((c) => (
            <button
              key={c.id}
              onClick={() => setChart(c.id)}
              className={`px-3 py-1.5 text-[11px] ${
                chart === c.id ? "bg-panel text-cyan" : "bg-panel-2 text-fg-mute hover:text-fg"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter artist or genre…"
          className="w-48 border border-line-2 bg-panel-2 px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
        />
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className="label border border-line-2 bg-panel-2 px-2 py-1.5 focus:outline-none"
        >
          <option value="all">All tiers</option>
          <option value="superstar">Superstar</option>
          <option value="established">Established</option>
          <option value="emerging">Emerging</option>
          <option value="dormant">Dormant</option>
        </select>

        <button
          onClick={() => setDetailed((v) => !v)}
          className="label ml-auto border border-line-2 px-2 py-1.5 hover:border-accent hover:text-accent"
        >
          {detailed ? "Fewer columns" : "More columns"}
        </button>
        <span className="label">
          {view.length} ranked · showing {Math.min(limit, view.length)}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="border-b border-line">
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => c.key !== "rank" && click(c.key)}
                  className={`label select-none px-3 py-2 font-normal ${
                    c.key === "rank" ? "" : "cursor-pointer hover:text-fg"
                  } ${c.align === "right" ? "text-right" : "text-left"} ${c.w ?? ""} ${
                    sort === c.key ? "text-accent" : ""
                  }`}
                >
                  {c.label}
                  {sort === c.key && c.key !== "rank" ? (dir === 1 ? " ▾" : " ▴") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.slice(0, limit).map((a, i) => (
              <tr key={a.id} className="border-b border-line/50 hover:bg-panel-2">
                <td className="num px-3 py-1.5 text-right text-fg-mute">{i + 1}</td>
                <td className="max-w-0 px-3 py-1.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={a.name} src={avatars[a.id]} size={26} />
                    <span className="min-w-0 truncate">
                      <ArtistLink id={a.id} name={a.name} />
                      <span className="ml-2 text-fg-mute">{a.genre}</span>
                    </span>
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <TierBadge tier={a.tier} />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <LiveCell value={a.listeners} render={fmtListeners} />
                </td>
                <td className={`num px-3 py-1.5 text-right ${toneClass(a.growth30)}`}>
                  {fmtSignedPct(a.growth30)}
                </td>
                {detailed && (
                  <>
                    <td className={`num px-3 py-1.5 text-right ${toneClass(a.growth90)}`}>
                      {fmtSignedPct(a.growth90)}
                    </td>
                    <td className="num px-3 py-1.5 text-right text-fg-dim">
                      {fmtPct(a.volatility, 0)}
                    </td>
                  </>
                )}
                <td className="px-3 py-1.5 text-right">
                  <LiveCell value={a.price} render={(v) => fmtCredits(v)} />
                </td>
                <td className={`num px-3 py-1.5 text-right ${toneClass(a.chg)}`}>
                  {a.chg === 0 ? "—" : fmtSignedPct(a.chg, 2)}
                </td>
              </tr>
            ))}
            {view.length === 0 && (
              <tr>
                <td colSpan={cols.length}>
                  <Empty>Nothing matches that filter</Empty>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {view.length > limit && (
          <button
            onClick={() => setLimit((l) => l + 200)}
            className="label w-full border-t border-line py-2 hover:text-accent"
          >
            Show more ({view.length - limit} remaining)
          </button>
        )}
      </div>
    </div>
  );
}
