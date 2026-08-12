"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMarket } from "@/lib/client/useMarket";
import { RankingsTable } from "@/components/RankingsTable";
import { Movers } from "@/components/Movers";
import { Tape } from "@/components/Tape";
import { IndexChart } from "@/components/charts/IndexChart";
import { Panel } from "@/components/ui";
import { fmtCredits, fmtListeners, fmtSignedPct, toneClass } from "@/lib/format";
import type { ArtistSummary } from "@/lib/data/provider";

/**
 * The front page answers three questions and then gets out of the way: where
 * is the market, what is moving, and what is listed. Everything else has its
 * own page.
 */
export default function RankingsPage() {
  const m = useMarket();
  const [rows, setRows] = useState<ArtistSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showTape, setShowTape] = useState(false);

  useEffect(() => {
    fetch("/api/artists")
      .then((r) => r.json())
      .then((d: { artists: ArtistSummary[] }) => setRows(d.artists))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const totalListeners = rows.reduce((s, a) => {
    const q = m.quote(a.id, a.price, a.listeners);
    return s + (q.listeners || a.listeners);
  }, 0);

  const indexChange = (m.index.equal - 100) / 100;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-6">
      {/* Headline: the index, large, with everything else subordinate to it. */}
      <section className="panel">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <div className="label">Emerging Artist Index</div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="num text-4xl text-fg">{fmtCredits(m.index.equal)}</span>
              <span className={`num text-lg ${toneClass(indexChange)}`}>
                {fmtSignedPct(indexChange, 2)}
              </span>
            </div>
            <div className="label mt-1">equal-weighted · since listing</div>
          </div>

          <div className="flex gap-8">
            <Figure
              label="Listener-weighted"
              value={fmtCredits(m.index.weighted)}
              tone={toneClass(m.index.weighted - 100)}
            />
            <Figure label="Artists listed" value={rows.length.toLocaleString()} />
            <Figure label="Universe listeners" value={fmtListeners(totalListeners)} />
            <Figure
              label="Your equity"
              value={fmtCredits(m.account.equity)}
              tone={toneClass(m.account.sessionPnl)}
              href="/portfolio"
            />
          </div>
        </div>
        <IndexChart height={260} />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_340px]">
        <Panel title="Rankings" className="min-w-0" bodyClass="max-h-[68vh]">
          {loaded ? (
            <RankingsTable rows={rows} defaultLimit={60} />
          ) : (
            <div className="label px-3 py-12 text-center">Loading universe…</div>
          )}
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel title="Movers" right={<span className="label">this tick</span>}>
            <Movers rows={rows} />
          </Panel>

          <Panel
            title="Tape"
            right={
              <button
                onClick={() => setShowTape((v) => !v)}
                className="label hover:text-accent"
              >
                {showTape ? "Hide" : "Show"}
              </button>
            }
            bodyClass={showTape ? "max-h-[40vh] overflow-auto" : ""}
          >
            {showTape ? (
              <Tape limit={60} />
            ) : (
              <p className="px-3 py-3 text-xs text-fg-mute">
                Live trades and market events. Hidden by default — it updates every second.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  tone = "",
  href,
}: {
  label: string;
  value: string;
  tone?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="label">{label}</div>
      <div className={`num mt-1 text-lg ${tone || "text-fg"}`}>{value}</div>
    </>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-80">
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}
