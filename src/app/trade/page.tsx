"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMarket } from "@/lib/client/useMarket";
import { TradeTicket, LmsrExplainer } from "@/components/TradeTicket";
import { PortfolioPanels, type PortfolioData } from "@/components/Portfolio";
import { Tape } from "@/components/Tape";
import { Panel, TierBadge } from "@/components/ui";
import { fmtCredits, fmtSignedPct, toneClass } from "@/lib/format";
import type { ArtistSummary } from "@/lib/data/provider";

export default function TradePage() {
  return (
    <Suspense fallback={<div className="label px-4 py-16 text-center">Loading…</div>}>
      <TradeScreen />
    </Suspense>
  );
}

function TradeScreen() {
  const params = useSearchParams();
  const m = useMarket();
  const [artists, setArtists] = useState<ArtistSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [pf, setPf] = useState<PortfolioData | null>(null);

  useEffect(() => {
    fetch("/api/artists")
      .then((r) => r.json())
      .then((d: { artists: ArtistSummary[] }) => {
        setArtists(d.artists);
        const fromUrl = Number(params.get("artist"));
        setSelected((s) => s ?? (fromUrl || d.artists[0]?.id) ?? null);
      })
      .catch(() => {});
  }, [params]);

  const loadPortfolio = useCallback(() => {
    fetch("/api/portfolio")
      .then((r) => r.json())
      .then(setPf)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPortfolio();
    const t = setInterval(loadPortfolio, 15_000);
    return () => clearInterval(t);
  }, [loadPortfolio]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? artists.filter((a) => a.name.toLowerCase().includes(q) || a.genre.toLowerCase().includes(q))
      : artists;
    return rows.slice(0, 60);
  }, [artists, query]);

  const current = artists.find((a) => a.id === selected) ?? null;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_360px_1fr]">
        <Panel title="Markets" bodyClass="flex flex-col max-h-[560px]">
          <div className="border-b border-line p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search artists…"
              className="w-full border border-line-2 bg-panel-2 px-2 py-1 text-xs focus:border-accent focus:outline-none"
            />
          </div>
          <ul className="min-h-0 flex-1 overflow-auto">
            {list.map((a) => {
              const q = m.quote(a.id, a.price);
              const chg = q.prev > 0 ? q.price / q.prev - 1 : 0;
              return (
                <li key={a.id}>
                  <button
                    onClick={() => setSelected(a.id)}
                    className={`flex w-full items-baseline gap-2 px-2 py-1 text-left text-[11px] hover:bg-panel-2 ${
                      selected === a.id ? "bg-panel-2 text-fg" : "text-fg-dim"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <span className="num shrink-0">{fmtCredits(q.price)}</span>
                    <span className={`num w-14 shrink-0 text-right ${toneClass(chg)}`}>
                      {chg === 0 ? "—" : fmtSignedPct(chg, 1)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel
          title="Trade ticket"
          right={current ? <TierBadge tier={current.tier} /> : null}
        >
          <TradeTicket artistId={selected} onTraded={loadPortfolio} />
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="How this market prices">
            <LmsrExplainer
              b={current?.b ?? 0}
              vMax={current?.vMax ?? 0}
              subsidy={(current?.b ?? 0) * (current?.vMax ?? 0) * Math.LN2}
            />
          </Panel>
          <Panel title="Tape" bodyClass="max-h-[220px] overflow-auto">
            <Tape limit={30} />
          </Panel>
        </div>
      </div>

      {pf ? (
        <PortfolioPanels data={pf} onPick={setSelected} />
      ) : (
        <div className="label px-3 py-8 text-center">Loading portfolio…</div>
      )}
    </div>
  );
}
