"use client";

import { useMarket } from "@/lib/client/useMarket";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { ArtistLink, Empty, Panel, Stat, TierBadge } from "@/components/ui";
import { LiveCell } from "@/components/LiveCell";
import { fmtCompact, fmtCredits, fmtPct, fmtSigned, fmtSignedPct, toneClass } from "@/lib/format";
import { fmtSimDate } from "@/lib/sim/time";

export interface PortfolioData {
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
  grossExposure: number;
  concentrationLimit: number;
  blotter: {
    id: number; side: string; qty: number; cost: number; priceBefore: number;
    priceAfter: number; tMs: number; realised: number;
    artist: { id: number; name: string };
  }[];
  equity: { tMs: number; equity: number; cash: number; marketValue: number; realised: number }[];
}

export function PortfolioPanels({ data, onPick }: { data: PortfolioData; onPick: (id: number) => void }) {
  const m = useMarket();
  const acc = data.account;

  // Mark holdings at the live quote rather than the value at fetch time.
  const holdings = data.holdings.map((h) => {
    const price = m.quote(h.artistId, h.price).price;
    const marketValue = h.qty * price;
    return { ...h, price, marketValue, unrealised: marketValue - h.costBasis };
  });
  const marketValue = holdings.reduce((s, h) => s + h.marketValue, 0);
  const equity = m.account.equity || acc.cash + marketValue;
  const unrealised = holdings.reduce((s, h) => s + h.unrealised, 0);
  const concentrated = holdings.filter(
    (h) => equity > 0 && Math.abs(h.marketValue) / equity > data.concentrationLimit,
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-6">
        <Stat label="Equity" value={<LiveCell value={equity} render={(v) => fmtCredits(v)} />} />
        <Stat label="Credits" value={fmtCompact(acc.cash)} sub="uninvested" />
        <Stat label="Market value" value={fmtCompact(marketValue)} sub={`${holdings.length} names`} />
        <Stat
          label="Unrealised"
          value={fmtSigned(unrealised)}
          tone={toneClass(unrealised)}
        />
        <Stat
          label="Realised"
          value={fmtSigned(acc.realisedPnl)}
          tone={toneClass(acc.realisedPnl)}
        />
        <Stat
          label="Session P&L"
          value={fmtSigned(m.account.sessionPnl || acc.sessionPnl)}
          tone={toneClass(m.account.sessionPnl || acc.sessionPnl)}
          sub={`total ${fmtSignedPct(equity / acc.startingCash - 1, 2)}`}
        />
      </div>

      {concentrated.length > 0 && (
        <div className="border border-accent/50 bg-accent/5 px-3 py-2 text-[11px] text-accent">
          <span className="label text-accent">Concentration</span>{" "}
          {concentrated
            .map((h) => `${h.name} is ${fmtPct(Math.abs(h.marketValue) / equity, 0)} of equity`)
            .join(" · ")}
          . Above the {fmtPct(data.concentrationLimit, 0)} threshold. In a universe where a
          handful of names carry the entire return distribution, single-name risk is the
          dominant term in your variance.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Holdings" bodyClass="max-h-[340px] overflow-auto">
          {holdings.length === 0 ? (
            <Empty>No positions</Empty>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-panel">
                <tr className="border-b border-line">
                  <Th>Artist</Th>
                  <Th right>Qty</Th>
                  <Th right>Avg</Th>
                  <Th right>Mark</Th>
                  <Th right>Value</Th>
                  <Th right>Unreal.</Th>
                  <Th right>Wt</Th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr
                    key={h.artistId}
                    onClick={() => onPick(h.artistId)}
                    className="cursor-pointer border-b border-line/50 hover:bg-panel-2"
                  >
                    <td className="max-w-0 truncate px-2 py-1">
                      <ArtistLink id={h.artistId} name={h.name} />
                      {!h.active && <span className="label ml-2 text-down">exited</span>}
                    </td>
                    <td className={`num px-2 py-1 text-right ${h.qty < 0 ? "text-down" : ""}`}>
                      {h.qty.toFixed(0)}
                    </td>
                    <td className="num px-2 py-1 text-right text-fg-mute">
                      {fmtCredits(h.avgPrice)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <LiveCell value={h.price} render={(v) => fmtCredits(v)} />
                    </td>
                    <td className="num px-2 py-1 text-right">{fmtCompact(h.marketValue)}</td>
                    <td className={`num px-2 py-1 text-right ${toneClass(h.unrealised)}`}>
                      {fmtSigned(h.unrealised, 0)}
                    </td>
                    <td
                      className={`num px-2 py-1 text-right ${
                        equity > 0 && Math.abs(h.marketValue) / equity > data.concentrationLimit
                          ? "text-accent"
                          : "text-fg-mute"
                      }`}
                    >
                      {fmtPct(equity > 0 ? Math.abs(h.marketValue) / equity : 0, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Equity curve" right={<span className="label">simulated time</span>}>
          <SeriesChart
            data={data.equity.map((e) => ({ t: e.tMs, v: e.equity }))}
            height={300}
            color="#3ddc97"
            area
            format={(v) => fmtCompact(v)}
            label="equity"
          />
        </Panel>
      </div>

      <Panel title="Trade blotter" bodyClass="max-h-[300px] overflow-auto">
        {data.blotter.length === 0 ? (
          <Empty>You have not traded yet</Empty>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-line">
                <Th>Date</Th>
                <Th>Side</Th>
                <Th>Artist</Th>
                <Th right>Qty</Th>
                <Th right>Fill</Th>
                <Th right>Impact</Th>
                <Th right>Credits</Th>
                <Th right>Realised</Th>
              </tr>
            </thead>
            <tbody>
              {data.blotter.map((t) => (
                <tr key={t.id} className="border-b border-line/50 hover:bg-panel-2">
                  <td className="num px-2 py-1 text-fg-mute">{fmtSimDate(t.tMs)}</td>
                  <td className={`label px-2 py-1 ${t.side === "BUY" ? "text-up" : "text-down"}`}>
                    {t.side}
                  </td>
                  <td className="max-w-0 truncate px-2 py-1">
                    <ArtistLink id={t.artist.id} name={t.artist.name} />
                  </td>
                  <td className="num px-2 py-1 text-right">{Math.abs(t.qty).toFixed(0)}</td>
                  <td className="num px-2 py-1 text-right">
                    {fmtCredits(Math.abs(t.cost / (t.qty || 1)))}
                  </td>
                  <td className="num px-2 py-1 text-right text-fg-mute">
                    {fmtSignedPct(
                      t.priceBefore > 0 ? t.priceAfter / t.priceBefore - 1 : 0,
                      2,
                    )}
                  </td>
                  <td className="num px-2 py-1 text-right">{fmtCompact(-t.cost)}</td>
                  <td className={`num px-2 py-1 text-right ${toneClass(t.realised)}`}>
                    {t.realised === 0 ? "—" : fmtSigned(t.realised, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`label px-2 py-1.5 font-normal ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
