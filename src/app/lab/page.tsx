"use client";

import { useCallback, useEffect, useState } from "react";
import { ArtistPicker } from "@/components/lab/ArtistPicker";
import { DcfTool, type DcfPayload } from "@/components/lab/DcfTool";
import { McTool } from "@/components/lab/McTool";
import { SurvivalTool } from "@/components/lab/SurvivalTool";
import { SurvivorshipTool } from "@/components/lab/SurvivorshipTool";
import { DiversificationTool } from "@/components/lab/DiversificationTool";
import { AdverseTool } from "@/components/lab/AdverseTool";
import type { ArtistSummary } from "@/lib/data/provider";

const TABS = [
  ["dcf", "DCF"],
  ["montecarlo", "Monte Carlo"],
  ["survival", "Survival"],
  ["survivorship", "Survivorship bias"],
  ["diversification", "Diversification"],
  ["adverse", "Adverse selection"],
] as const;

type Tab = (typeof TABS)[number][0];

/** Tools that operate on one selected artist rather than the whole run. */
const PER_ARTIST: Tab[] = ["dcf", "montecarlo"];

export default function LabPage() {
  const [tab, setTab] = useState<Tab>("dcf");
  const [artists, setArtists] = useState<ArtistSummary[]>([]);
  const [artistId, setArtistId] = useState<number | null>(null);

  const [discount, setDiscount] = useState(0.14);
  const [months, setMonths] = useState(24);
  const [survivorsOnly, setSurvivorsOnly] = useState(true);
  const [advantage, setAdvantage] = useState(0.7);
  const [offerPrice, setOfferPrice] = useState(1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<Record<string, any>>({});
  const [error, setError] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/artists")
      .then((r) => r.json())
      .then((d: { artists: ArtistSummary[] }) => {
        setArtists(d.artists);
        setArtistId((s) => s ?? d.artists[0]?.id ?? null);
      })
      .catch(() => {});
  }, []);

  const run = useCallback(
    async (tool: Tab) => {
      if (PER_ARTIST.includes(tool) && artistId === null) return;
      setBusy(true);
      try {
        const res = await fetch("/api/lab", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tool,
            artistId,
            discount,
            months,
            informationAdvantage: advantage,
            offerPrice,
          }),
        });
        const j = await res.json();
        if (!res.ok) {
          setError((e) => ({ ...e, [tool]: j.error ?? "failed" }));
          setData((d) => ({ ...d, [tool]: null }));
        } else {
          setError((e) => ({ ...e, [tool]: null }));
          setData((d) => ({ ...d, [tool]: j }));
        }
      } catch {
        setError((e) => ({ ...e, [tool]: "request failed" }));
      } finally {
        setBusy(false);
      }
    },
    [artistId, discount, months, advantage, offerPrice],
  );

  // Re-run whenever the active tab or any input it depends on changes.
  useEffect(() => {
    void run(tab);
  }, [tab, run]);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-px bg-line">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 text-xs ${
                tab === key ? "bg-panel text-accent" : "bg-panel-2 text-fg-mute hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {PER_ARTIST.includes(tab) && (
          <ArtistPicker artists={artists} value={artistId} onChange={setArtistId} />
        )}
        {busy && <span className="label ml-auto">Computing…</span>}
      </div>

      {tab === "dcf" && (
        <DcfTool data={(data.dcf as DcfPayload) ?? null} discount={discount} onDiscount={setDiscount} />
      )}
      {tab === "montecarlo" && <McTool data={data.montecarlo ?? null} />}
      {tab === "survival" && <SurvivalTool data={data.survival ?? null} />}
      {tab === "survivorship" && (
        <SurvivorshipTool
          data={data.survivorship ?? null}
          months={months}
          onMonths={setMonths}
          survivorsOnly={survivorsOnly}
          onToggle={setSurvivorsOnly}
          error={error.survivorship ?? null}
        />
      )}
      {tab === "diversification" && (
        <DiversificationTool
          data={data.diversification ?? null}
          error={error.diversification ?? null}
        />
      )}
      {tab === "adverse" && (
        <AdverseTool
          data={data.adverse ?? null}
          advantage={advantage}
          onAdvantage={setAdvantage}
          price={offerPrice}
          onPrice={setOfferPrice}
        />
      )}
    </div>
  );
}
