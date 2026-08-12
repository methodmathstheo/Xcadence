"use client";

import { useEffect, useState } from "react";
import { useMarket } from "@/lib/client/useMarket";
import { RankingsTable } from "@/components/RankingsTable";
import { Movers } from "@/components/Movers";
import { Tape } from "@/components/Tape";
import { IndexChart } from "@/components/charts/IndexChart";
import { Panel, Stat } from "@/components/ui";
import { fmtCredits, fmtListeners, fmtSignedPct, toneClass } from "@/lib/format";
import type { ArtistSummary } from "@/lib/data/provider";

export default function RankingsPage() {
  const m = useMarket();
  const [rows, setRows] = useState<ArtistSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  // One load for the static columns; the stream keeps prices and listeners
  // current from there.
  useEffect(() => {
    fetch("/api/artists")
      .then((r) => r.json())
      .then((d: { artists: ArtistSummary[] }) => setRows(d.artists))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const listed = rows.length;
  const totalListeners = rows.reduce((s, a) => {
    const q = m.quote(a.id, a.price, a.listeners);
    return s + (q.listeners || a.listeners);
  }, 0);
  const emerging = rows.filter((a) => a.tier === "emerging").length;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4">
      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-5">
        <Stat
          label="EAI · equal-weighted"
          value={fmtCredits(m.index.equal)}
          tone={toneClass(m.index.equal - 100)}
          sub={fmtSignedPct((m.index.equal - 100) / 100, 2) + " since listing"}
        />
        <Stat
          label="EAI · listener-weighted"
          value={fmtCredits(m.index.weighted)}
          tone={toneClass(m.index.weighted - 100)}
          sub={fmtSignedPct((m.index.weighted - 100) / 100, 2) + " since listing"}
        />
        <Stat label="Artists listed" value={listed.toLocaleString()} sub={`${emerging} emerging`} />
        <Stat label="Universe listeners" value={fmtListeners(totalListeners)} sub="monthly, live" />
        <Stat
          label="Account equity"
          value={fmtCredits(m.account.equity)}
          tone={toneClass(m.account.sessionPnl)}
          sub={`session ${fmtSignedPct(
            m.account.sessionPnl / Math.max(1, m.account.equity - m.account.sessionPnl),
            2,
          )}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <Panel title="Emerging Artist Index" className="min-w-0">
          <IndexChart height={220} />
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Movers · this tick">
            <Movers rows={rows} />
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <Panel title="Rankings" className="min-w-0" bodyClass="max-h-[70vh]">
          {loaded ? (
            <RankingsTable rows={rows} />
          ) : (
            <div className="label px-3 py-10 text-center">Loading universe…</div>
          )}
        </Panel>

        <Panel title="Tape" bodyClass="max-h-[70vh] overflow-auto">
          <Tape limit={80} />
        </Panel>
      </div>
    </div>
  );
}
