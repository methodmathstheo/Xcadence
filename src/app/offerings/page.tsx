"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { axisProps, CHART, tooltipStyle } from "@/components/charts/theme";
import { ArtistLink, Empty, Panel, Stat, TierBadge } from "@/components/ui";
import { useMarket } from "@/lib/client/useMarket";
import { Avatar } from "@/components/Avatar";
import { useAvatars } from "@/lib/client/useAvatars";
import {
  fmtCompact, fmtCredits, fmtListeners, fmtPct, fmtSignedPct, toneClass,
} from "@/lib/format";
import { fmtSimDate } from "@/lib/sim/time";

interface Payload {
  simMs: number;
  cash: number;
  open: {
    id: number; artistId: number; artistName: string; tier: string; genre: string;
    listeners: number; monthlyRoyalty: number; pctRoyalty: number; askCredits: number;
    termMonths: number; filled: number; remaining: number; expiresMs: number;
    modelValue: number; priceToModel: number;
  }[];
  positions: {
    id: number; artistId: number; artistName: string; artistActive: boolean;
    credits: number; sharePct: number; pctRoyalty: number; termMonths: number;
    monthsPaid: number; monthsLeft: number; royalties: number; active: boolean;
    multiple: number; ret: number; irr: number | null;
    projectedTotal: number; projectedReturn: number;
  }[];
  cohort: {
    taken: number; closed: number; deployed: number; received: number;
    stats: { n: number; mean: number; median: number; p10: number; p90: number; shareBelowZero: number; top5Share: number };
    closedStats: { n: number; mean: number; median: number };
    shareBelowCost: number;
    histogram: { label: string; count: number }[];
  };
}

export default function OfferingsPage() {
  const m = useMarket();
  const { avatars } = useAvatars();
  const [d, setD] = useState<Payload | null>(null);
  const [amount, setAmount] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/offerings").then((r) => r.json()).then(setD).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 12_000);
    return () => clearInterval(t);
  }, [load]);

  const allocate = async (offeringId: number) => {
    const credits = Number(amount[offeringId]);
    if (!(credits > 0)) return;
    const res = await fetch("/api/offerings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offeringId, credits }),
    });
    const j = await res.json();
    setMsg(res.ok ? `Allocated ${fmtCredits(j.allocated)} credits.` : `Rejected — ${j.error}`);
    setAmount((a) => ({ ...a, [offeringId]: "" }));
    load();
  };

  if (!d) return <div className="label px-4 py-16 text-center">Loading offerings…</div>;

  const c = d.cohort;
  const skewVisible = c.stats.n > 0;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4">
      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-5">
        <Stat label="Credits available" value={fmtCredits(m.account.cash || d.cash)} />
        <Stat label="Offerings open" value={String(d.open.length)} />
        <Stat label="Positions taken" value={String(c.taken)} sub={`${c.closed} settled`} />
        <Stat label="Capital deployed" value={fmtCompact(c.deployed)} />
        <Stat
          label="Royalties received"
          value={fmtCompact(c.received)}
          tone={c.received >= c.deployed ? "text-up" : "text-down"}
          sub={c.deployed > 0 ? `${(c.received / c.deployed).toFixed(2)}× deployed` : "—"}
        />
      </div>

      {msg && <div className="border border-line bg-panel-2 px-3 py-1.5 text-xs text-fg-dim">{msg}</div>}

      <Panel title="Open offerings" right={<span className="label">primary market</span>}>
        {d.open.length === 0 ? (
          <Empty>No offerings open. New ones list over simulated time.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line">
                  <Th>Artist</Th>
                  <Th>Tier</Th>
                  <Th right>Listeners</Th>
                  <Th right>Royalty / mo</Th>
                  <Th right>Share</Th>
                  <Th right>Term</Th>
                  <Th right>Ask</Th>
                  <Th right>Model value</Th>
                  <Th right>Price / model</Th>
                  <Th right>Filled</Th>
                  <Th>Closes</Th>
                  <Th right>Allocate</Th>
                </tr>
              </thead>
              <tbody>
                {d.open.map((o) => (
                  <tr key={o.id} className="border-b border-line/50 hover:bg-panel-2">
                    <td className="max-w-0 px-2 py-1.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar name={o.artistName} src={avatars[o.artistId]} size={22} />
                        <ArtistLink id={o.artistId} name={o.artistName} className="truncate" />
                      </span>
                    </td>
                    <td className="px-2 py-1.5"><TierBadge tier={o.tier} /></td>
                    <td className="num px-2 py-1.5 text-right">{fmtListeners(o.listeners)}</td>
                    <td className="num px-2 py-1.5 text-right">{fmtCompact(o.monthlyRoyalty)}</td>
                    <td className="num px-2 py-1.5 text-right">{fmtPct(o.pctRoyalty, 1)}</td>
                    <td className="num px-2 py-1.5 text-right">{o.termMonths}m</td>
                    <td className="num px-2 py-1.5 text-right text-fg">{fmtCompact(o.askCredits)}</td>
                    <td className="num px-2 py-1.5 text-right text-fg-mute">{fmtCompact(o.modelValue)}</td>
                    <td className={`num px-2 py-1.5 text-right ${o.priceToModel > 1 ? "text-down" : "text-up"}`}>
                      {o.priceToModel.toFixed(2)}×
                    </td>
                    <td className="num px-2 py-1.5 text-right text-fg-mute">
                      {fmtPct(o.askCredits > 0 ? o.filled / o.askCredits : 0, 0)}
                    </td>
                    <td className="num px-2 py-1.5 text-fg-mute">{fmtSimDate(o.expiresMs)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <span className="flex items-center justify-end gap-1">
                        <input
                          value={amount[o.id] ?? ""}
                          onChange={(e) =>
                            setAmount((a) => ({ ...a, [o.id]: e.target.value.replace(/[^\d.]/g, "") }))
                          }
                          placeholder={fmtCompact(Math.min(o.remaining, 5000))}
                          className="num w-20 border border-line-2 bg-panel-2 px-1 py-1.5 text-right focus:border-accent focus:outline-none"
                        />
                        <button
                          onClick={() => allocate(o.id)}
                          className="label border border-line-2 px-1.5 py-1.5 hover:border-accent hover:text-accent"
                        >
                          Take
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Your positions">
        {d.positions.length === 0 ? (
          <Empty>No offerings taken yet</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line">
                  <Th>Artist</Th>
                  <Th right>Deployed</Th>
                  <Th right>Royalty share</Th>
                  <Th right>Received</Th>
                  <Th right>Multiple</Th>
                  <Th right>IRR</Th>
                  <Th right>Months</Th>
                  <Th right>Projected total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {d.positions.map((p) => (
                  <tr key={p.id} className="border-b border-line/50">
                    <td className="max-w-0 px-2 py-1.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar name={p.artistName} src={avatars[p.artistId]} size={22} />
                        <ArtistLink id={p.artistId} name={p.artistName} className="truncate" />
                      </span>
                    </td>
                    <td className="num px-2 py-1.5 text-right">{fmtCompact(p.credits)}</td>
                    <td className="num px-2 py-1.5 text-right">{fmtPct(p.sharePct, 3)}</td>
                    <td className="num px-2 py-1.5 text-right text-fg">{fmtCompact(p.royalties)}</td>
                    <td className={`num px-2 py-1.5 text-right ${toneClass(p.ret)}`}>
                      {p.multiple.toFixed(2)}×
                    </td>
                    <td className={`num px-2 py-1.5 text-right ${p.irr === null ? "text-fg-mute" : toneClass(p.irr)}`}>
                      {p.irr === null ? "—" : fmtSignedPct(p.irr)}
                    </td>
                    <td className="num px-2 py-1.5 text-right text-fg-mute">
                      {p.monthsPaid}/{p.termMonths}
                    </td>
                    <td className="num px-2 py-1.5 text-right">
                      {fmtCompact(p.projectedTotal)}{" "}
                      <span className={toneClass(p.projectedReturn)}>
                        ({fmtSignedPct(p.projectedReturn, 0)})
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      {p.active ? (
                        <span className="label text-up">accruing</span>
                      ) : !p.artistActive ? (
                        <span className="label text-down">artist delisted</span>
                      ) : (
                        <span className="label text-fg-mute">term ended</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_3fr]">
        <Panel title="Cohort · every offering taken in this run">
          {c.taken === 0 ? (
            <Empty>Take an offering to start the cohort</Empty>
          ) : (
            <div className="p-3">
              <dl className="space-y-1.5 text-xs">
                <Row k="Positions" v={String(c.stats.n)} />
                <Row k="Mean return" v={fmtSignedPct(c.stats.mean)} tone={toneClass(c.stats.mean)} />
                <Row k="Median return" v={fmtSignedPct(c.stats.median)} tone={toneClass(c.stats.median)} />
                <Row k="P10" v={fmtSignedPct(c.stats.p10)} tone={toneClass(c.stats.p10)} />
                <Row k="P90" v={fmtSignedPct(c.stats.p90)} tone={toneClass(c.stats.p90)} />
                <Row k="Returned less than invested" v={fmtPct(c.shareBelowCost, 0)} tone="text-down" />
                <Row k="Top 5% share of value" v={fmtPct(c.stats.top5Share, 0)} />
              </dl>
              {skewVisible && (
                <p className="mt-3 border-t border-line pt-2 text-xs leading-relaxed text-fg-mute">
                  Mean {fmtSignedPct(c.stats.mean)} against median{" "}
                  {fmtSignedPct(c.stats.median)}. Both are shown because averaging this
                  distribution hides it: the mean is pulled up by whichever few positions
                  happened to land on an artist who kept growing, and the median is what
                  most of them did.
                </p>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Distribution of outcomes">
          {c.taken === 0 ? (
            <Empty>No outcomes yet</Empty>
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={c.histogram} margin={{ top: 10, right: 14, bottom: 40, left: 4 }}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    height={60}
                    {...axisProps}
                  />
                  <YAxis width={40} allowDecimals={false} {...axisProps} />
                  <Tooltip {...tooltipStyle} formatter={(v) => [`${v} positions`, "count"]} />
                  <Bar dataKey="count" isAnimationActive={false}>
                    {c.histogram.map((b, i) => (
                      <Cell key={i} fill={i < 4 ? CHART.down : CHART.up} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <p className="max-w-4xl text-xs leading-relaxed text-fg-mute">
        Offerings are priced off the same tier-based hazard estimate the rest of the venue uses,
        while each artist&apos;s real hazard is drawn individually. Artists who are worse than
        they look are therefore systematically willing to sell at the asking price, which is why
        most of these positions return less than they cost. Nothing is weighted to produce that
        result — it is the same adverse selection the lab lets you dial directly. Payments stop
        the month an artist ceases to be commercially active, whatever the term said.
      </p>
    </div>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`label px-2 py-1.5 font-normal ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Row({ k, v, tone = "" }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-fg-mute">{k}</dt>
      <dd className={`num ${tone || "text-fg"}`}>{v}</dd>
    </div>
  );
}
