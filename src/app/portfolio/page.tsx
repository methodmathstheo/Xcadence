"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { axisProps, CHART, tooltipStyle } from "@/components/charts/theme";
import { useMarket } from "@/lib/client/useMarket";
import { LiveCell } from "@/components/LiveCell";
import { Avatar } from "@/components/Avatar";
import { useAvatars } from "@/lib/client/useAvatars";
import { ArtistLink, Empty, Panel, Stat, TierBadge } from "@/components/ui";
import {
  fmtCompact, fmtCredits, fmtPct, fmtSigned, fmtSignedPct, toneClass,
} from "@/lib/format";
import { fmtSimDate } from "@/lib/sim/time";
import type { PortfolioAnalysis } from "@/lib/quant/portfolio";

interface Payload {
  simMs: number;
  analysis: PortfolioAnalysis;
  benchmark: { tMs: number; equal: number }[];
  historyReady: boolean;
  account: {
    cash: number; startingCash: number; realisedPnl: number; sessionStartEquity: number;
    marketValue: number; cost: number; unrealised: number; equity: number;
    sessionPnl: number; totalReturn: number;
  };
  holdings: {
    artistId: number; name: string; tier: string; active: boolean; qty: number;
    avgPrice: number; price: number; costBasis: number; marketValue: number;
    unrealised: number; realised: number; weight: number; concentrated: boolean;
  }[];
  equity: { tMs: number; equity: number; cash: number; marketValue: number; realised: number }[];
  concentrationLimit: number;
}

export default function PortfolioPage() {
  const m = useMarket();
  const { avatars } = useAvatars();
  const [d, setD] = useState<Payload | null>(null);

  const load = useCallback(() => {
    fetch("/api/portfolio").then((r) => r.json()).then(setD).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 12_000);
    return () => clearInterval(t);
  }, [load]);

  // Rebase the equity curve and the index to 100 so growth is comparable.
  const growth = useMemo(() => {
    if (!d || d.equity.length === 0) return [];
    const base = d.equity[0].equity || 1;
    const bench = d.benchmark;
    const benchBase = bench[0]?.equal || 100;
    return d.equity.map((e) => {
      let b: number | undefined;
      for (const p of bench) {
        if (p.tMs <= e.tMs) b = (p.equal / benchBase) * 100;
        else break;
      }
      return { t: e.tMs, book: (e.equity / base) * 100, index: b };
    });
  }, [d]);

  if (!d) return <div className="label px-4 py-16 text-center">Loading portfolio…</div>;

  const a = d.analysis;
  const acc = d.account;
  const equity = m.account.equity || acc.equity;
  const hasBook = a.stats.holdings > 0;

  const contribution = d.holdings
    .map((h) => ({ name: h.name, artistId: h.artistId, pnl: h.unrealised + h.realised }))
    .sort((x, y) => Math.abs(y.pnl) - Math.abs(x.pnl))
    .slice(0, 12);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 py-5">
      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-6">
        <Stat label="Equity" value={<LiveCell value={equity} render={(v) => fmtCredits(v)} />} />
        <Stat
          label="Total return"
          value={fmtSignedPct(equity / acc.startingCash - 1, 2)}
          tone={toneClass(equity - acc.startingCash)}
          sub={`from ${fmtCompact(acc.startingCash)}`}
        />
        <Stat
          label="Unrealised"
          value={fmtSigned(acc.unrealised)}
          tone={toneClass(acc.unrealised)}
        />
        <Stat
          label="Realised"
          value={fmtSigned(acc.realisedPnl)}
          tone={toneClass(acc.realisedPnl)}
        />
        <Stat label="Cash" value={fmtCompact(acc.cash)} sub="uninvested" />
        <Stat
          label="Positions"
          value={String(a.stats.holdings)}
          sub={`${a.stats.effectiveHoldings.toFixed(1)} effective`}
        />
      </div>

      {!hasBook ? (
        <Panel title="No positions">
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-fg-dim">Your book is empty.</p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-fg-mute">
              Take a position on the trading desk and this page will monitor it — risk,
              correlation, growth against the index, and what mean-variance says to add next.
            </p>
            <Link
              href="/trade"
              className="label mt-4 inline-block border border-line-2 px-4 py-2 hover:border-accent hover:text-accent"
            >
              Go to the trading desk →
            </Link>
          </div>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-6">
            <Stat
              label="Expected return"
              value={fmtSignedPct(a.stats.expectedMonthly, 2)}
              tone={toneClass(a.stats.expectedMonthly)}
              sub="per month, modelled"
            />
            <Stat label="Volatility" value={fmtPct(a.stats.volMonthly, 1)} sub="monthly, realised" />
            <Stat
              label="Return / risk"
              value={a.stats.sharpe.toFixed(2)}
              tone={toneClass(a.stats.sharpe)}
              sub="rf = 0"
            />
            <Stat
              label="Mean correlation"
              value={a.stats.meanPairwiseCorr.toFixed(3)}
              sub="between holdings"
            />
            <Stat
              label="Largest position"
              value={fmtPct(Math.abs(a.stats.largestWeight), 0)}
              tone={Math.abs(a.stats.largestWeight) > d.concentrationLimit ? "text-accent" : ""}
              sub={a.stats.largestName}
            />
            <Stat label="Gross exposure" value={fmtCompact(a.stats.grossExposure)} />
          </div>

          {!d.historyReady && (
            <div className="border border-accent/40 bg-accent/5 px-3 py-2 text-xs text-accent">
              Not enough monthly price history yet for the risk figures to mean much. Advance the
              clock a few simulated months and they will settle.
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[3fr_2fr]">
            <Panel
              title="Growth"
              right={<span className="label">book vs equal-weighted index, rebased to 100</span>}
            >
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={growth} margin={{ top: 10, right: 16, bottom: 4, left: 4 }}>
                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      scale="time"
                      tickFormatter={(v) => fmtSimDate(v).slice(3)}
                      minTickGap={44}
                      {...axisProps}
                    />
                    <YAxis width={52} domain={["auto", "auto"]} {...axisProps} />
                    <Tooltip
                      {...tooltipStyle}
                      labelFormatter={(v) => fmtSimDate(Number(v))}
                      formatter={(v, n) => [
                        fmtCredits(Number(v)),
                        n === "book" ? "Your book" : "Index",
                      ]}
                    />
                    <Legend
                      verticalAlign="top"
                      height={20}
                      iconType="plainline"
                      formatter={(v) => (
                        <span style={{ fontSize: 11, color: "#98a1b0" }}>
                          {v === "book" ? "YOUR BOOK" : "INDEX"}
                        </span>
                      )}
                    />
                    <ReferenceLine y={100} stroke={CHART.grid} strokeDasharray="3 3" />
                    <Line
                      dataKey="book"
                      stroke={CHART.up}
                      strokeWidth={1.8}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey="index"
                      stroke={CHART.axis}
                      strokeWidth={1.3}
                      strokeDasharray="4 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel
              title="Risk and return"
              right={<span className="label">random mixes of your names + candidates</span>}
            >
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 16, bottom: 12, left: 4 }}>
                    <CartesianGrid stroke={CHART.grid} />
                    <XAxis
                      type="number"
                      dataKey="vol"
                      name="risk"
                      tickFormatter={(v) => fmtPct(Number(v), 0)}
                      label={{ value: "monthly volatility", fill: "#67707e", fontSize: 10, dy: 14 }}
                      {...axisProps}
                    />
                    <YAxis
                      type="number"
                      dataKey="ret"
                      name="return"
                      tickFormatter={(v) => fmtPct(Number(v), 1)}
                      width={54}
                      {...axisProps}
                    />
                    <ZAxis range={[26, 26]} />
                    <Tooltip
                      {...tooltipStyle}
                      cursor={{ stroke: CHART.grid }}
                      formatter={(v, n) => [fmtPct(Number(v), 2), String(n)]}
                    />
                    <Scatter data={a.frontier.filter((f) => !f.current)} isAnimationActive={false}>
                      {a.frontier.filter((f) => !f.current).map((_, i) => (
                        <Cell key={i} fill="#2f3947" />
                      ))}
                    </Scatter>
                    <Scatter
                      data={a.frontier.filter((f) => f.current)}
                      fill={CHART.accent}
                      shape="star"
                      isAnimationActive={false}
                    />
                    {a.equalWeight && (
                      <Scatter data={[a.equalWeight]} fill={CHART.cyan} isAnimationActive={false} />
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <p className="px-3 pb-2 text-xs leading-relaxed text-fg-mute">
                Grey dots are randomly weighted mixes of your holdings and the top candidates.
                Amber star is your book as it stands; blue is the same names held equally. Up and
                to the left is better.
              </p>
            </Panel>
          </div>

          <Panel title="Positions" bodyClass="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line">
                  <Th>Artist</Th>
                  <Th>Tier</Th>
                  <Th right>Qty</Th>
                  <Th right>Avg</Th>
                  <Th right>Mark</Th>
                  <Th right>Value</Th>
                  <Th right>Weight</Th>
                  <Th right>Unrealised</Th>
                  <Th right>Vol</Th>
                  <Th right>Beta</Th>
                  <Th right>Corr</Th>
                  <Th right>Alpha</Th>
                </tr>
              </thead>
              <tbody>
                {d.holdings.map((h) => {
                  const s = a.positions.find((p) => p.artistId === h.artistId);
                  const price = m.quote(h.artistId, h.price).price;
                  const mv = h.qty * price;
                  return (
                    <tr key={h.artistId} className="border-b border-line/50 hover:bg-panel-2">
                      <td className="max-w-0 px-3 py-1.5">
                        <span className="flex min-w-0 items-center gap-2">
                          <Avatar name={h.name} src={avatars[h.artistId]} size={22} />
                          <ArtistLink id={h.artistId} name={h.name} className="truncate" />
                          {!h.active && <span className="label shrink-0 text-down">delisted</span>}
                        </span>
                      </td>
                      <td className="px-3 py-1.5"><TierBadge tier={h.tier} /></td>
                      <td className={`num px-3 py-1.5 text-right ${h.qty < 0 ? "text-down" : ""}`}>
                        {h.qty.toFixed(0)}
                      </td>
                      <td className="num px-3 py-1.5 text-right text-fg-mute">{fmtCredits(h.avgPrice)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <LiveCell value={price} render={(v) => fmtCredits(v)} />
                      </td>
                      <td className="num px-3 py-1.5 text-right">{fmtCompact(mv)}</td>
                      <td className={`num px-3 py-1.5 text-right ${h.concentrated ? "text-accent" : "text-fg-mute"}`}>
                        {fmtPct(Math.abs(h.weight), 0)}
                      </td>
                      <td className={`num px-3 py-1.5 text-right ${toneClass(mv - h.costBasis)}`}>
                        {fmtSigned(mv - h.costBasis, 0)}
                      </td>
                      <td className="num px-3 py-1.5 text-right text-fg-mute">
                        {s ? fmtPct(s.volMonthly, 0) : "—"}
                      </td>
                      <td className="num px-3 py-1.5 text-right text-fg-mute">
                        {s ? s.beta.toFixed(2) : "—"}
                      </td>
                      <td className="num px-3 py-1.5 text-right text-fg-mute">
                        {s ? s.correlation.toFixed(2) : "—"}
                      </td>
                      <td className={`num px-3 py-1.5 text-right ${s ? toneClass(s.alpha) : ""}`}>
                        {s ? fmtSignedPct(s.alpha, 2) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Panel title="Contribution to P&L" right={<span className="label">realised + unrealised</span>}>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={contribution}
                    layout="vertical"
                    margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
                  >
                    <CartesianGrid stroke={CHART.grid} horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => fmtCompact(Number(v))} {...axisProps} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fill: "#98a1b0", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip {...tooltipStyle} formatter={(v) => [fmtSigned(Number(v), 0), "P&L"]} />
                    <ReferenceLine x={0} stroke={CHART.axis} />
                    <Bar dataKey="pnl" isAnimationActive={false}>
                      {contribution.map((c, i) => (
                        <Cell key={i} fill={c.pnl >= 0 ? CHART.up : CHART.down} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Suggested additions" right={<span className="label">ranked by appraisal ratio</span>}>
              {a.suggestions.length === 0 ? (
                <Empty>Nothing in the candidate set improves this book</Empty>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-line">
                      <Th>Artist</Th>
                      <Th>Tier</Th>
                      <Th right>Price</Th>
                      <Th right>Expected</Th>
                      <Th right>Alpha</Th>
                      <Th right>Corr</Th>
                      <Th right>Appraisal</Th>
                      <Th right />
                    </tr>
                  </thead>
                  <tbody>
                    {a.suggestions.map((s) => (
                      <tr key={s.artistId} className="border-b border-line/50 hover:bg-panel-2">
                        <td className="max-w-0 px-3 py-1.5">
                          <span className="flex min-w-0 items-center gap-2">
                            <Avatar name={s.name} src={avatars[s.artistId]} size={22} />
                            <ArtistLink id={s.artistId} name={s.name} className="truncate" />
                          </span>
                        </td>
                        <td className="px-3 py-1.5"><TierBadge tier={s.tier} /></td>
                        <td className="num px-3 py-1.5 text-right">{fmtCredits(s.price)}</td>
                        <td className={`num px-3 py-1.5 text-right ${toneClass(s.expectedMonthly)}`}>
                          {fmtSignedPct(s.expectedMonthly, 2)}
                        </td>
                        <td className={`num px-3 py-1.5 text-right ${toneClass(s.alpha)}`}>
                          {fmtSignedPct(s.alpha, 2)}
                        </td>
                        <td className="num px-3 py-1.5 text-right text-fg-mute">
                          {s.correlation.toFixed(2)}
                        </td>
                        <td className="num px-3 py-1.5 text-right text-fg">
                          {s.appraisal.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <Link
                            href={`/trade?artist=${s.artistId}`}
                            className="label border border-line-2 px-2 py-1.5 hover:border-accent hover:text-accent"
                          >
                            Trade
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>

          {a.trims.length > 0 && (
            <Panel title="Worth reviewing" right={<span className="label">negative alpha or oversized</span>}>
              <ul className="divide-y divide-line/60">
                {a.trims.map((t) => (
                  <li key={t.artistId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-xs">
                    <Avatar name={t.name} src={avatars[t.artistId]} size={20} />
                    <ArtistLink id={t.artistId} name={t.name} className="text-fg-dim" />
                    <span className="text-fg-mute">
                      {Math.abs(t.weight) > 0.2
                        ? `${fmtPct(Math.abs(t.weight), 0)} of equity — above the 20% threshold`
                        : `alpha ${fmtSignedPct(t.alpha, 2)} — expected return does not cover its exposure to the rest of the book`}
                    </span>
                    <Link
                      href={`/trade?artist=${t.artistId}`}
                      className="label ml-auto border border-line-2 px-2 py-1.5 hover:border-accent hover:text-accent"
                    >
                      Review
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}

      <div className="border border-line bg-panel-2 px-4 py-3 text-xs leading-relaxed text-fg-dim">
        <span className="label text-fg">How the suggestions are made</span>
        <p className="mt-2">
          Risk is measured: volatilities, betas and correlations come from realised monthly log
          returns. Expected return is not measured — it comes from one assumption, that a contract
          priced away from its DCF closes{" "}
          <span className="num text-fg">{fmtPct(a.assumption.convergence, 0)}</span> of that gap
          per simulated month.
        </p>
        <p className="mt-2">
          A name is suggested when its <span className="text-fg">alpha</span> is positive — its
          expected return beats what its exposure to the book you already hold would have earned
          anyway — and it is ranked on{" "}
          <span className="text-fg">appraisal ratio</span>, alpha divided by the risk that
          diversification cannot remove. That is why a lightly correlated name can outrank one with
          a higher raw expected return.
        </p>
        <p className="mt-2 text-fg-mute">
          The assumption is the weak link, and it is worth being blunt about it: the market in this
          simulation does not reliably converge to DCF, and the DCF it would converge to is built
          on a hazard rate averaged across a whole tier. The run inspector measures exactly how
          wrong that gets. Read these as what mean-variance says if you accept the model, not as a
          view on what will happen.
        </p>
      </div>
    </div>
  );
}

function Th({ children, right = false }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`label px-3 py-2 font-normal ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
