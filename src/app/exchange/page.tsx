"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMarket } from "@/lib/client/useMarket";
import { useAvatars } from "@/lib/client/useAvatars";
import { Avatar } from "@/components/Avatar";
import { CandleChart } from "@/components/exchange/CandleChart";
import { OrderBook } from "@/components/exchange/OrderBook";
import { quoteTrade } from "@/lib/sim/lmsr";
import {
  fmtCompact, fmtCredits, fmtListeners, fmtPct, fmtSignedPct, toneClass,
} from "@/lib/format";
import { fmtClock, fmtSimDate } from "@/lib/sim/time";
import type { ArtistSummary } from "@/lib/data/provider";
import type { Book, Candle } from "@/lib/sim/orderbook";

const UP = "#26a69a";
const DOWN = "#ef5350";

interface MarketPayload {
  market: {
    id: number; name: string; genre: string; tier: string; active: boolean;
    price: number; prevPrice: number; change: number; high: number; low: number;
    volume: number; listeners: number; monthlyRoyalty: number; fairValue: number;
    divergence: number; b: number; vMax: number; q: number; unitScale: number;
    avatar: string | null;
  };
  candles: Candle[];
  book: Book;
  trades: { id: number; side: string; qty: number; price: number; tMs: number; who: string; mine: boolean }[];
  account: { cash: number; position: { qty: number; costBasis: number; realised: number }; maxBuy: number };
}

export default function ExchangePage() {
  return (
    <Suspense fallback={<div className="label px-4 py-16 text-center">Loading terminal…</div>}>
      <Terminal />
    </Suspense>
  );
}

function Terminal() {
  const params = useSearchParams();
  const m = useMarket();
  const { avatars } = useAvatars();

  const [artists, setArtists] = useState<ArtistSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [data, setData] = useState<MarketPayload | null>(null);
  const [query, setQuery] = useState("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [size, setSize] = useState("100");
  const [status, setStatus] = useState<string | null>(null);
  const [tab, setTab] = useState<"trades" | "position">("trades");

  useEffect(() => {
    fetch("/api/artists")
      .then((r) => r.json())
      .then((d: { artists: ArtistSummary[] }) => {
        setArtists(d.artists);
        const fromUrl = Number(params.get("m"));
        setSelected((s) => s ?? (fromUrl || d.artists[0]?.id) ?? null);
      })
      .catch(() => {});
  }, [params]);

  const load = useCallback(() => {
    if (selected === null) return;
    fetch(`/api/market/${selected}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => {});
  }, [selected]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? artists.filter(
          (a) => a.name.toLowerCase().includes(q) || a.genre.toLowerCase().includes(q),
        )
      : artists;
    return rows.slice(0, 120);
  }, [artists, query]);

  const live = data ? m.quote(data.market.id, data.market.price).price : 0;
  const signedQty = useMemo(() => {
    const n = Math.abs(Number(size)) || 0;
    return side === "BUY" ? n : -n;
  }, [size, side]);

  const preview = useMemo(() => {
    if (!data || signedQty === 0 || live <= 0) return null;
    const { b, vMax } = data.market;
    const qLive = b * Math.log(live / Math.max(vMax - live, 1e-9));
    return quoteTrade(qLive, b, vMax, signedQty);
  }, [data, signedQty, live]);

  const submit = async () => {
    if (!preview || selected === null) return;
    setStatus("working");
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artistId: selected, qty: signedQty }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setStatus(
        `${j.fill.side} ${Math.abs(j.fill.qty).toFixed(0)} @ ${fmtCredits(Math.abs(j.fill.avgPrice))}`,
      );
      load();
    } catch (e) {
      setStatus(`Rejected — ${(e as Error).message}`);
    }
  };

  const mk = data?.market;
  const affordable = !preview || preview.cost <= (data?.account.cash ?? 0) + 1e-9;

  return (
    <div className="flex h-[calc(100vh-118px)] min-h-[640px] flex-col bg-[#0b0e11] text-fg">
      {/* ---- instrument header */}
      <header className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-line bg-[#0f1418] px-4 py-2.5">
        {mk ? (
          <>
            <div className="flex items-center gap-3">
              <Avatar name={mk.name} src={mk.avatar ?? avatars[mk.id]} size={34} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-medium">{mk.name}</span>
                  <span className="label">/ CR</span>
                </div>
                <div className="label">{mk.genre} · {mk.tier}</div>
              </div>
            </div>
            <div>
              <div
                className="num text-2xl"
                style={{ color: live >= mk.prevPrice ? UP : DOWN }}
              >
                {fmtCredits(live)}
              </div>
              <div className={`num text-[11px] ${toneClass(mk.change)}`}>
                {fmtSignedPct(mk.change, 2)}
              </div>
            </div>
            <Field label="24h high" value={fmtCredits(mk.high)} />
            <Field label="24h low" value={fmtCredits(mk.low)} />
            <Field label="Volume" value={fmtCompact(mk.volume)} sub="contracts" />
            <Field label="Listeners" value={fmtListeners(mk.listeners)} />
            <Field
              label="DCF"
              value={fmtCredits(mk.fairValue)}
              sub={`${fmtSignedPct(mk.divergence, 1)} vs mkt`}
            />
            <div className="ml-auto flex items-center gap-3">
              <span className="label">
                {m.clock.simMs ? `${fmtSimDate(m.clock.simMs)} ${fmtClock(m.clock.simMs)}` : ""}
              </span>
              <Link href={`/artist/${mk.id}`} className="label border border-line-2 px-2 py-1 hover:border-accent hover:text-accent">
                Profile
              </Link>
            </div>
          </>
        ) : (
          <span className="label">Loading market…</span>
        )}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[240px_1fr_248px_260px]">
        {/* ---- markets */}
        <aside className="flex min-h-0 flex-col border-r border-line bg-[#0f1418]">
          <div className="border-b border-line p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search markets"
              className="w-full border border-line-2 bg-[#0b0e11] px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between px-3 py-1 text-[10px] uppercase tracking-wider text-fg-mute">
            <span>Market</span>
            <span>Price / Chg</span>
          </div>
          <ul className="min-h-0 flex-1 overflow-auto">
            {list.map((a) => {
              const q = m.quote(a.id, a.price);
              const chg = q.prev > 0 ? q.price / q.prev - 1 : 0;
              return (
                <li key={a.id}>
                  <button
                    onClick={() => setSelected(a.id)}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] hover:bg-white/5 ${
                      selected === a.id ? "bg-white/5 text-fg" : "text-fg-dim"
                    }`}
                  >
                    <Avatar name={a.name} src={avatars[a.id]} size={18} />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <span className="num shrink-0">{fmtCredits(q.price)}</span>
                    <span
                      className="num w-12 shrink-0 text-right"
                      style={{ color: chg > 0 ? UP : chg < 0 ? DOWN : "#808b99" }}
                    >
                      {chg === 0 ? "—" : fmtSignedPct(chg, 1)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ---- chart + bottom tabs */}
        <section className="flex min-h-0 flex-col border-r border-line">
          <div className="min-h-0 flex-1">
            {data ? <CandleChart candles={data.candles} height={420} /> : null}
          </div>
          <div className="border-t border-line bg-[#0f1418]">
            <div className="flex gap-px bg-line">
              {(["trades", "position"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-1.5 text-[11px] capitalize ${
                    tab === t ? "bg-[#0f1418] text-accent" : "bg-[#0b0e11] text-fg-mute hover:text-fg"
                  }`}
                >
                  {t === "trades" ? "Market trades" : "Your position"}
                </button>
              ))}
            </div>
            <div className="max-h-[168px] overflow-auto">
              {tab === "trades" ? (
                <table className="w-full text-[11px]">
                  <tbody>
                    {(data?.trades ?? []).map((t) => (
                      <tr key={t.id} className={t.mine ? "bg-accent/5" : ""}>
                        <td className="num px-3 py-1" style={{ color: t.side === "BUY" ? UP : DOWN }}>
                          {t.side}
                        </td>
                        <td className="num px-3 py-1 text-right">{fmtCompact(t.qty)}</td>
                        <td className="num px-3 py-1 text-right text-fg">{fmtCredits(t.price)}</td>
                        <td className="num px-3 py-1 text-fg-mute">{fmtSimDate(t.tMs)}</td>
                        <td className="truncate px-3 py-1 text-fg-mute">{t.who}</td>
                      </tr>
                    ))}
                    {(data?.trades ?? []).length === 0 && (
                      <tr><td className="label px-3 py-4">No prints yet</td></tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
                  <Cell label="Position" value={`${(data?.account.position.qty ?? 0).toFixed(0)} contracts`} />
                  <Cell
                    label="Avg price"
                    value={
                      data && data.account.position.qty !== 0
                        ? fmtCredits(data.account.position.costBasis / data.account.position.qty)
                        : "—"
                    }
                  />
                  <Cell
                    label="Unrealised"
                    value={
                      data
                        ? fmtCompact(data.account.position.qty * live - data.account.position.costBasis)
                        : "—"
                    }
                  />
                  <Cell label="Realised" value={data ? fmtCompact(data.account.position.realised) : "—"} />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ---- book */}
        <aside className="min-h-0 overflow-auto border-r border-line bg-[#0f1418]">
          {data ? (
            <OrderBook
              book={data.book}
              lastPrice={live}
              onPick={(p) => {
                // Clicking a level sizes the ticket to reach it, the way a book
                // click pre-fills a limit order.
                if (!data) return;
                const { b, vMax } = data.market;
                const qNow = b * Math.log(live / Math.max(vMax - live, 1e-9));
                const qTarget = b * Math.log(p / Math.max(vMax - p, 1e-9));
                const diff = qTarget - qNow;
                setSide(diff >= 0 ? "BUY" : "SELL");
                setSize(String(Math.max(1, Math.round(Math.abs(diff)))));
              }}
            />
          ) : null}
        </aside>

        {/* ---- ticket */}
        <aside className="flex min-h-0 flex-col overflow-auto bg-[#0f1418]">
          <div className="grid grid-cols-2 gap-px bg-line">
            {(["BUY", "SELL"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className="py-2 text-xs font-medium"
                style={{
                  background: side === s ? (s === "BUY" ? `${UP}22` : `${DOWN}22`) : "#0b0e11",
                  color: side === s ? (s === "BUY" ? UP : DOWN) : "#808b99",
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 p-3">
            <div>
              <label className="label mb-1 block">Amount · contracts</label>
              <input
                value={size}
                onChange={(e) => setSize(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                className="num w-full border border-line-2 bg-[#0b0e11] px-2 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>

            <div className="flex gap-1">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  onClick={() => {
                    const max =
                      side === "BUY"
                        ? (data?.account.maxBuy ?? 0)
                        : Math.abs(data?.account.position.qty ?? 0) || (data?.account.maxBuy ?? 0);
                    setSize(String(Math.floor((max * pct) / 100)));
                  }}
                  className="num flex-1 border border-line-2 py-1 text-[11px] text-fg-mute hover:border-accent hover:text-accent"
                >
                  {pct}%
                </button>
              ))}
            </div>

            <dl className="space-y-1 border-t border-line pt-2 text-[11px]">
              <Row k="Available" v={fmtCompact(data?.account.cash ?? 0)} />
              <Row k="Avg fill" v={preview ? fmtCredits(Math.abs(preview.avgPrice)) : "—"} />
              <Row
                k={side === "BUY" ? "Cost" : "Proceeds"}
                v={preview ? fmtCompact(Math.abs(preview.cost)) : "—"}
                tone={affordable ? "" : "text-down"}
              />
              <Row
                k="Slippage"
                v={preview ? fmtSignedPct(preview.slippage, 2) : "—"}
                tone={preview && Math.abs(preview.slippage) > 0.02 ? "text-down" : ""}
              />
              <Row
                k="Impact"
                v={preview ? `${fmtCredits(preview.priceBefore)} → ${fmtCredits(preview.priceAfter)}` : "—"}
              />
            </dl>

            <button
              onClick={submit}
              disabled={!preview || !affordable || status === "working"}
              className="py-2.5 text-xs font-semibold text-[#07080a] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: side === "BUY" ? UP : DOWN }}
            >
              {status === "working"
                ? "Working…"
                : !affordable
                  ? "Insufficient credits"
                  : `${side} ${mk?.name ?? ""}`}
            </button>

            {status && status !== "working" && (
              <p className="text-[11px] text-fg-dim">{status}</p>
            )}

            <div className="mt-2 border-t border-line pt-2 text-[11px] leading-relaxed text-fg-mute">
              No resting orders here — every fill is against an automated market maker, so the
              ladder is its cost curve rather than other people&apos;s bids. Clicking a level sizes
              the ticket to walk the quote there.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="num text-xs text-fg">{value}</div>
      {sub && <div className="label">{sub}</div>}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0f1418] px-3 py-2">
      <div className="label">{label}</div>
      <div className="num mt-0.5 text-xs text-fg">{value}</div>
    </div>
  );
}

function Row({ k, v, tone = "" }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-fg-mute">{k}</dt>
      <dd className={`num ${tone || "text-fg"}`}>{v}</dd>
    </div>
  );
}
