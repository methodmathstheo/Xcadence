"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMarket } from "@/lib/client/useMarket";
import { quoteTrade } from "@/lib/sim/lmsr";
import { fmtCompact, fmtCredits, fmtListeners, fmtPct, fmtSignedPct, toneClass } from "@/lib/format";
import { TierBadge } from "@/components/ui";

interface Ctx {
  artist: {
    id: number; name: string; tier: string; price: number;
    b: number; vMax: number; q: number; unitScale: number;
    listeners: number; monthlyRoyalty: number;
  };
  fairValue: number;
  divergence: number;
  cash: number;
  position: { qty: number; costBasis: number; realised: number };
  maxBuy: number;
  subsidy: number;
}

type Status = { kind: "idle" } | { kind: "working" } | { kind: "done"; text: string } | { kind: "error"; text: string };

/**
 * The trade ticket. LMSR has a closed-form cost function, so the impact and
 * slippage shown here are the exact consequences of pressing the button, not a
 * projection — the number you see is the number you get.
 */
export function TradeTicket({
  artistId,
  onTraded,
}: {
  artistId: number | null;
  onTraded: () => void;
}) {
  const m = useMarket();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [size, setSize] = useState("100");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const load = useCallback(() => {
    if (artistId === null) return;
    fetch(`/api/trade?artistId=${artistId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setCtx)
      .catch(() => setCtx(null));
  }, [artistId]);

  useEffect(() => {
    setStatus({ kind: "idle" });
    load();
  }, [load]);

  // Quote against the live price rather than the price at panel-load: the
  // market keeps moving while the ticket is open.
  const live = ctx ? m.quote(ctx.artist.id, ctx.artist.price).price : 0;
  const signedQty = useMemo(() => {
    const n = Math.abs(Number(size)) || 0;
    return side === "BUY" ? n : -n;
  }, [size, side]);

  const preview = useMemo(() => {
    if (!ctx || signedQty === 0 || live <= 0) return null;
    // Re-derive q from the live quote so the preview tracks the moving market.
    const qLive = ctx.artist.b * Math.log(live / Math.max(ctx.artist.vMax - live, 1e-9));
    return quoteTrade(qLive, ctx.artist.b, ctx.artist.vMax, signedQty);
  }, [ctx, signedQty, live]);

  if (artistId === null) {
    return <div className="label px-3 py-10 text-center">Select an artist to trade</div>;
  }
  if (!ctx) return <div className="label px-3 py-10 text-center">Loading market…</div>;

  const affordable = !preview || preview.cost <= ctx.cash + 1e-9;
  const rich = ctx.divergence > 0.15;
  const cheap = ctx.divergence < -0.15;

  const submit = async () => {
    if (!preview) return;
    setStatus({ kind: "working" });
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artistId, qty: signedQty }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "trade rejected");
      setStatus({
        kind: "done",
        text: `${j.fill.side} ${Math.abs(j.fill.qty).toFixed(0)} @ ${fmtCredits(
          Math.abs(j.fill.avgPrice),
        )} · ${fmtCompact(Math.abs(j.fill.cost))} credits`,
      });
      load();
      onTraded();
    } catch (e) {
      setStatus({ kind: "error", text: (e as Error).message });
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-fg">{ctx.artist.name}</span>
          <TierBadge tier={ctx.artist.tier} />
        </div>
        <span className="num text-sm text-fg">{fmtCredits(live)}</span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <Row k="Monthly listeners" v={fmtListeners(ctx.artist.listeners)} />
        <Row k="Monthly royalty" v={fmtCompact(ctx.artist.monthlyRoyalty)} />
        <Row k="DCF per contract" v={fmtCredits(ctx.fairValue)} />
        <Row
          k="Divergence"
          v={fmtSignedPct(ctx.divergence, 1)}
          tone={rich ? "text-down" : cheap ? "text-up" : ""}
        />
        <Row k="Your position" v={`${ctx.position.qty.toFixed(0)} contracts`} />
        <Row k="Credits" v={fmtCompact(ctx.cash)} />
      </dl>

      <div className="flex gap-px bg-line">
        {(["BUY", "SELL"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`label flex-1 py-1.5 ${
              side === s
                ? s === "BUY"
                  ? "bg-up/15 text-up"
                  : "bg-down/15 text-down"
                : "bg-panel-2 text-fg-mute hover:text-fg"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div>
        <label className="label mb-1 block">Contracts</label>
        <input
          value={size}
          onChange={(e) => setSize(e.target.value.replace(/[^\d.]/g, ""))}
          inputMode="decimal"
          className="num w-full border border-line-2 bg-panel-2 px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
        />
        <div className="mt-1 flex gap-1">
          {[25, 100, 500, 2000].map((n) => (
            <button
              key={n}
              onClick={() => setSize(String(n))}
              className="num flex-1 border border-line-2 py-1.5 text-xs text-fg-mute hover:border-accent hover:text-accent"
            >
              {n}
            </button>
          ))}
          <button
            onClick={() =>
              setSize(
                String(
                  Math.floor(side === "BUY" ? ctx.maxBuy : Math.abs(ctx.position.qty) || ctx.maxBuy),
                ),
              )
            }
            className="label flex-1 border border-line-2 py-1.5 hover:border-accent hover:text-accent"
          >
            Max
          </button>
        </div>
      </div>

      {preview && (
        <div className="border border-line-2 bg-panel-2 p-2">
          <div className="label mb-1">Before you confirm</div>
          <dl className="space-y-1 text-xs">
            <Row k="Average fill" v={fmtCredits(Math.abs(preview.avgPrice))} />
            <Row
              k={side === "BUY" ? "Credits out" : "Credits in"}
              v={fmtCompact(Math.abs(preview.cost))}
              tone={affordable ? "" : "text-down"}
            />
            <Row
              k="Price impact"
              v={`${fmtCredits(preview.priceBefore)} → ${fmtCredits(preview.priceAfter)}`}
              tone={toneClass(preview.impact)}
            />
            <Row
              k="Slippage"
              v={fmtSignedPct(preview.slippage, 2)}
              tone={Math.abs(preview.slippage) > 0.02 ? "text-down" : ""}
            />
          </dl>
          {Math.abs(preview.slippage) > 0.03 && (
            <p className="mt-1.5 text-xs leading-snug text-down">
              This size moves the quote by {fmtSignedPct(preview.impact / preview.priceBefore, 1)}.
              You are paying for most of that move yourself.
            </p>
          )}
        </div>
      )}

      <button
        onClick={submit}
        disabled={!preview || !affordable || status.kind === "working"}
        className={`py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
          side === "BUY"
            ? "border border-up/60 text-up hover:bg-up/10"
            : "border border-down/60 text-down hover:bg-down/10"
        }`}
      >
        {status.kind === "working"
          ? "Working…"
          : !affordable
            ? "Insufficient credits"
            : `${side} ${Math.abs(signedQty).toFixed(0)} contracts`}
      </button>

      {status.kind === "done" && (
        <p className="text-xs text-up">Filled · {status.text}</p>
      )}
      {status.kind === "error" && (
        <p className="text-xs text-down">Rejected · {status.text}</p>
      )}
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

export function LmsrExplainer({ b, vMax, subsidy }: { b: number; vMax: number; subsidy: number }) {
  return (
    <div className="space-y-2 p-3 text-xs leading-relaxed text-fg-dim">
      <p>
        Every artist has its own <span className="text-fg">logarithmic market scoring rule</span>{" "}
        maker rather than an order book. Price comes from one number, the net contracts the
        market is holding:
      </p>
      <pre className="num overflow-x-auto border border-line-2 bg-panel-2 p-2 text-xs text-fg">
{`price(q) = vMax · σ(q / b)
cost     = C(q + Δ) − C(q)
C(q)     = vMax · b · ln(1 + e^(q/b))`}
      </pre>
      <p>
        <span className="text-fg">b is liquidity.</span> It sets how far the quote travels per
        contract traded. A large b absorbs size with little movement; a small b means even a
        modest clip walks the price. This market runs b ={" "}
        <span className="num text-fg">{fmtCompact(b)}</span> against a contract cap of{" "}
        <span className="num text-fg">{fmtCredits(vMax)}</span>, so the maker&apos;s worst-case
        subsidy is <span className="num text-fg">{fmtCompact(subsidy)}</span> credits.
      </p>
      <p>
        <span className="text-fg">Why not an order book?</span> Roughly four hundred artists trade
        here and most of them are thin. An order book with no resting orders quotes nothing at
        all — you would stare at an empty screen on precisely the emerging names this venue
        exists for. LMSR always quotes, both sides, at a bounded and known cost to whoever
        subsidises it. What you give up is the ability to trade with no impact: your own size
        moves the price, and the slippage figure on the ticket is you paying for that.
      </p>
      <p className="text-fg-mute">
        Price is bounded in (0, vMax) by construction. When fundamentals push a quote near its
        cap the engine doubles vMax and re-solves q so the quoted price is unchanged — headroom
        appears without a jump in the tape.
      </p>
    </div>
  );
}
