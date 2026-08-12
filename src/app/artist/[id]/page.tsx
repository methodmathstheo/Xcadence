"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMarket } from "@/lib/client/useMarket";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { LiveCell } from "@/components/LiveCell";
import { Empty, Panel, Stat, TierBadge } from "@/components/ui";
import {
  AboutPanel, ArtistHeader, DiscographyPanel, type ProfilePayload,
} from "@/components/ArtistProfile";
import { EVENT_LABEL } from "@/lib/sim/constants";
import {
  fmtCompact, fmtCredits, fmtListeners, fmtPct, fmtSignedPct, toneClass,
} from "@/lib/format";
import { fmtSimDate } from "@/lib/sim/time";

interface Detail {
  simMs: number;
  artist: {
    id: number; name: string; genre: string; tier: string; active: boolean;
    debutMs: number; exitMs: number | null; exitReason: string | null;
    listeners: number; growth30: number; growth90: number; volatility: number;
    royaltyRate: number; monthlyRoyalty: number; price: number; prevPrice: number;
    q: number; b: number; vMax: number; unitScale: number;
  };
  history: { monthKey: number; dateMs: number; listeners: number; royalty: number; rank: number }[];
  events: { id: number; kind: string; magnitude: number; headline: string; tMs: number }[];
  prices: { tMs: number; price: number }[];
  ring: { t: number; p: number }[];
  trades: {
    id: number; actor: string; side: string; qty: number; cost: number;
    priceBefore: number; priceAfter: number; tMs: number; counterparty: string;
  }[];
  valuation: {
    pv: number; perContract: number; impliedMultiple: number; annualRoyalty: number;
    frontLoad: number; divergence: number; halvingRate: number | null;
    inputs: { growthAnnual: number; hazardMonthly: number; discountAnnual: number; horizonMonths: number };
  };
  position: { qty: number; costBasis: number; realised: number } | null;
}

export default function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const artistId = Number(id);
  const m = useMarket();
  const [d, setD] = useState<Detail | null>(null);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [err, setErr] = useState(false);
  const livePrices = useRef<{ t: number; v: number }[]>([]);

  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch(`/api/artist/${artistId}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((j: Detail) => {
          if (!stop) setD(j);
        })
        .catch(() => !stop && setErr(true));
    load();
    // The heavy series only change on simulated month ends; a slow refresh
    // keeps them current without re-fetching everything every tick.
    const t = setInterval(load, 20_000);

    // Profile is fetched once: photos and catalogues do not change on a tick.
    fetch(`/api/artist/${artistId}/profile`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: ProfilePayload) => {
        if (!stop) setProfile(j);
      })
      .catch(() => {});

    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [artistId]);

  const quote = m.quote(artistId, d?.artist.price ?? 0, d?.artist.listeners ?? 0);

  // Accumulate the live quote into a session series appended to stored closes.
  useEffect(() => {
    if (!m.clock.simMs || !quote.price) return;
    const arr = livePrices.current;
    const last = arr[arr.length - 1];
    if (last && m.clock.simMs <= last.t) return;
    arr.push({ t: m.clock.simMs, v: quote.price });
    if (arr.length > 600) arr.shift();
  }, [m.clock.simMs, quote.price]);

  const priceSeries = useMemo(() => {
    if (!d) return [];
    const stored = [...d.prices.map((p) => ({ t: p.tMs, v: p.price })), ...d.ring.map((p) => ({ t: p.t, v: p.p }))];
    stored.sort((a, b) => a.t - b.t);
    const cutoff = stored.length ? stored[stored.length - 1].t : 0;
    return [...stored, ...livePrices.current.filter((p) => p.t > cutoff)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, m.version]);

  if (err) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <p className="label">No such artist in this run.</p>
        <Link href="/" className="mt-3 inline-block text-xs text-accent hover:underline">
          ← Back to rankings
        </Link>
      </div>
    );
  }
  if (!d) return <div className="label px-4 py-16 text-center">Loading…</div>;

  const a = d.artist;
  const live = quote.price || a.price;
  const listeners = quote.listeners || a.listeners;
  const v = d.valuation;
  const rich = v.divergence > 0.2;
  const cheap = v.divergence < -0.2;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          <ArtistHeader name={a.name} profile={profile} />
          <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl text-fg">{a.name}</h1>
            <TierBadge tier={a.tier} />
            {!a.active && (
              <span className="label border border-down/50 px-1.5 py-px text-down">
                exited {a.exitMs ? fmtSimDate(a.exitMs) : ""} · {a.exitReason}
              </span>
            )}
          </div>
          <p className="label mt-1">
            {a.genre} · debut {fmtSimDate(a.debutMs)} · contract = 1/
            {fmtCompact(a.unitScale)} of the royalty claim
          </p>
          {profile?.spotify?.url && (
            <a
              href={profile.spotify.url}
              target="_blank"
              rel="noreferrer noopener"
              className="label mt-1 inline-block text-up hover:underline"
            >
              Open on Spotify ↗
            </a>
          )}
          </div>
        </div>
        <Link href="/trade" className="label border border-line-2 px-3 py-1.5 hover:border-accent hover:text-accent">
          Trade this artist →
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-6">
        <Stat
          label="Market price"
          value={<LiveCell value={live} render={(x) => fmtCredits(x)} />}
          sub={quote.prev > 0 ? fmtSignedPct(live / quote.prev - 1, 2) : "—"}
        />
        <Stat label="Monthly listeners" value={<LiveCell value={listeners} render={fmtListeners} />} />
        <Stat label="30d / 90d" value={`${fmtSignedPct(a.growth30)} / ${fmtSignedPct(a.growth90)}`} tone={toneClass(a.growth30)} />
        <Stat label="Volatility" value={fmtPct(a.volatility, 0)} sub="annualised, realised" />
        <Stat label="Monthly royalty" value={fmtCompact(a.monthlyRoyalty)} sub={`${fmtCompact(v.annualRoyalty)} / yr`} />
        <Stat
          label="DCF vs market"
          value={fmtSignedPct(v.divergence, 1)}
          tone={rich ? "text-down" : cheap ? "text-up" : "text-fg"}
          sub={`fair ${fmtCredits(v.perContract)}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Live price" right={<span className="label">{d.prices.length} closes + session</span>}>
          <SeriesChart
            data={priceSeries}
            height={220}
            color="#f0b429"
            format={(x) => fmtCredits(x, 1)}
            label="price"
          />
        </Panel>

        <Panel title="Streaming history" right={<span className="label">monthly listeners</span>}>
          <SeriesChart
            data={d.history.map((h) => ({ t: h.dateMs, v: h.listeners }))}
            height={220}
            color="#4cc4f0"
            area
            format={fmtListeners}
            label="listeners"
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr_1fr]">
        <Panel title="Rank trajectory" right={<span className="label">1 = top of universe</span>}>
          <SeriesChart
            data={d.history.map((h) => ({ t: h.dateMs, v: h.rank }))}
            height={170}
            color="#a78bfa"
            reversed
            format={(x) => `#${Math.round(x)}`}
            label="rank"
          />
        </Panel>

        <Panel title="Derived valuation" bodyClass="p-3">
          <dl className="space-y-1.5 text-xs">
            <Row k="Present value of claim" v={fmtCompact(v.pv)} />
            <Row k="Per contract" v={fmtCredits(v.perContract)} />
            <Row k="Market price" v={fmtCredits(live)} />
            <Row
              k="Divergence"
              v={fmtSignedPct(v.divergence, 1)}
              tone={rich ? "text-down" : cheap ? "text-up" : ""}
            />
            <Row k="Implied multiple" v={`${v.impliedMultiple.toFixed(1)}× annual royalty`} />
            <Row k="Assumed growth" v={fmtSignedPct(v.inputs.growthAnnual)} />
            <Row k="Assumed hazard" v={`${fmtPct(v.inputs.hazardMonthly, 2)} / month`} />
            <Row k="Discount rate" v={fmtPct(v.inputs.discountAnnual, 0)} />
            <Row k="Value halves at" v={v.halvingRate ? fmtPct(v.halvingRate, 1) : "beyond 30%"} />
            <Row k="First 24 months" v={`${fmtPct(v.frontLoad, 0)} of PV`} />
          </dl>
          <p className="mt-3 border-t border-line pt-2 text-xs leading-relaxed text-fg-mute">
            Built from observable fundamentals and a hazard rate inferred from tier.
            It does not use this artist&apos;s actual hazard — neither does the market.
          </p>
        </Panel>

        <Panel title="Order flow" bodyClass="max-h-[240px] overflow-auto">
          {d.trades.length === 0 ? (
            <Empty>No prints in this market yet</Empty>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {d.trades.map((t) => (
                  <tr key={t.id} className="border-b border-line/50">
                    <td className="num px-2 py-1.5 text-fg-mute">{fmtSimDate(t.tMs).slice(0, 6)}</td>
                    <td className={`label px-2 py-1.5 ${t.side === "BUY" ? "text-up" : "text-down"}`}>
                      {t.side}
                    </td>
                    <td className="num px-2 py-1.5 text-right">{Math.round(t.qty)}</td>
                    <td className="num px-2 py-1.5 text-right text-fg">
                      {fmtCredits(t.priceAfter)}
                    </td>
                    <td className="max-w-0 truncate px-2 py-1.5 text-fg-mute">{t.counterparty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_3fr]">
        <AboutPanel profile={profile} />
        <DiscographyPanel profile={profile} />
      </div>

      <Panel title="Event log" bodyClass="max-h-[300px] overflow-auto">
        {d.events.length === 0 ? (
          <Empty>Nothing has happened to this artist yet</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {d.events.map((e) => (
              <li key={e.id} className="flex items-baseline gap-3 px-3 py-1.5 text-xs">
                <span className="num shrink-0 text-fg-mute">{fmtSimDate(e.tMs)}</span>
                <span className="label w-24 shrink-0">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                <span className="truncate text-fg-dim">{e.headline}</span>
                {e.magnitude !== 0 && (
                  <span className={`num ml-auto shrink-0 ${toneClass(e.magnitude)}`}>
                    {fmtSignedPct(e.magnitude, 0)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
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
