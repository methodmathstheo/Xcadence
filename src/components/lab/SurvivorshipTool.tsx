"use client";

import { ArtistLink, Empty, Panel, Stat } from "@/components/ui";
import { Slider } from "@/components/lab/ArtistPicker";
import { fmtPct, fmtSignedPct, toneClass } from "@/lib/format";
import type { CohortStats, SurvivorshipResult } from "@/lib/quant/cohort";

/**
 * The switch. Everything else in the lab is a tool; this one is an argument.
 */
export function SurvivorshipTool({
  data, months, onMonths, survivorsOnly, onToggle, error,
}: {
  data: SurvivorshipResult | null;
  months: number;
  onMonths: (v: number) => void;
  survivorsOnly: boolean;
  onToggle: (v: boolean) => void;
  error: string | null;
}) {
  if (error) return <div className="px-3 py-10 text-center text-xs text-down">{error}</div>;
  if (!data) return <div className="label px-3 py-10 text-center">Computing cohort…</div>;

  const active = survivorsOnly ? data.survivorsOnly : data.fullCohort;

  return (
    <div className="flex flex-col gap-4">
      <div className="panel flex flex-wrap items-center gap-6 px-3 py-2">
        <Slider
          label="Look back"
          value={months}
          min={3}
          max={120}
          step={1}
          onChange={onMonths}
          format={(v) => `${v}m`}
        />
        <div className="flex items-center gap-px bg-line">
          {[
            { on: true, label: "Survivors only" },
            { on: false, label: "Full cohort" },
          ].map((o) => (
            <button
              key={o.label}
              onClick={() => onToggle(o.on)}
              className={`px-4 py-1.5 text-xs ${
                survivorsOnly === o.on
                  ? o.on
                    ? "bg-down/15 text-down"
                    : "bg-up/15 text-up"
                  : "bg-panel-2 text-fg-mute hover:text-fg"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span className="label ml-auto">
          {data.cohortSize} listed {months}m ago · {data.survivors} still listed ·{" "}
          <span className="text-down">{data.exited} delisted</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-6">
        <Stat
          label="Mean return"
          value={fmtSignedPct(active.mean)}
          tone={toneClass(active.mean)}
          sub={survivorsOnly ? "survivors only" : "everyone who was there"}
        />
        <Stat label="Median return" value={fmtSignedPct(active.median)} tone={toneClass(active.median)} />
        <Stat label="P10" value={fmtSignedPct(active.p10)} tone={toneClass(active.p10)} />
        <Stat label="P90" value={fmtSignedPct(active.p90)} tone={toneClass(active.p90)} />
        <Stat label="Lost money" value={fmtPct(active.shareBelowZero, 0)} tone="text-down" />
        <Stat
          label="Top 5% share"
          value={fmtPct(active.top5Share, 0)}
          sub="of ending value"
        />
      </div>

      <Panel title="Side by side">
        <div className="grid grid-cols-1 gap-px bg-line md:grid-cols-3">
          <Column title="Survivors only" tone="text-down" s={data.survivorsOnly} />
          <Column title="Full cohort" tone="text-up" s={data.fullCohort} />
          <div className="bg-panel p-3">
            <div className="label mb-2">Overstatement</div>
            <div className="num text-2xl text-down">
              {data.overstatementMean === null ? "—" : fmtSignedPct(data.overstatementMean, 1)}
            </div>
            <p className="mt-1 text-xs text-fg-mute">on mean return</p>
            <div className="num mt-3 text-lg text-down">
              {data.overstatementMedian === null ? "—" : fmtSignedPct(data.overstatementMedian, 1)}
            </div>
            <p className="mt-1 text-xs text-fg-mute">on median return</p>
            {data.overstatementMedian === null && (
              <p className="mt-1 text-[11px] leading-snug text-fg-mute">
                Undefined rather than infinite: the full-cohort median is a total loss, so there
                is no finite ratio between the two. The typical name in this cohort went to zero.
              </p>
            )}
            <div className="mt-3 border-t border-line pt-2 text-xs text-fg-mute">
              Annualised: survivors {fmtSignedPct(data.cagrSurvivors)} vs full cohort{" "}
              {fmtSignedPct(data.cagrFull)}
            </div>
          </div>
        </div>
      </Panel>

      <div className="border border-line bg-panel-2 px-3 py-2.5 text-xs leading-relaxed text-fg-dim">
        <span className="label text-fg">Why the left column is what naive analysis produces</span>
        <p className="mt-1.5">
          The obvious way to study returns in this market is to pull the list of artists trading
          today and look at what their contracts have done. Every name on that list has one thing
          in common that has nothing to do with skill: it is still there. The{" "}
          <span className="num text-down">{data.exited}</span> artists who were listed{" "}
          {months} months ago and have since gone quiet are not in the sample, and their contracts
          went to zero.
        </p>
        <p className="mt-1.5">
          Both columns are computed from the same recorded run. The engine writes an exit date and
          keeps the row; nothing is deleted. Taking the survivors-only figure at face value
          overstates the mean return by{" "}
          <span className="num text-down">
            {data.overstatementMean === null ? "an undefined factor" : fmtSignedPct(data.overstatementMean, 1)}
          </span>{" "}
          — and
          the error is not a constant you can subtract off, because it grows with the horizon and
          with the hazard rate of the tier you are looking at.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="Best outcomes">
          <Rows rows={data.best} />
        </Panel>
        <Panel title="Worst outcomes">
          <Rows rows={data.worst} />
        </Panel>
      </div>
    </div>
  );
}

function Column({ title, tone, s }: { title: string; tone: string; s: CohortStats }) {
  return (
    <div className="bg-panel p-3">
      <div className={`label mb-2 ${tone}`}>{title}</div>
      <dl className="space-y-1 text-xs">
        {[
          ["Names", String(s.n)],
          ["Mean", fmtSignedPct(s.mean)],
          ["Median", fmtSignedPct(s.median)],
          ["P10", fmtSignedPct(s.p10)],
          ["P90", fmtSignedPct(s.p90)],
          ["Lost money", fmtPct(s.shareBelowZero, 0)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-fg-mute">{k}</dt>
            <dd className="num text-fg">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Rows({
  rows,
}: {
  rows: { artistId: number; name: string; ret: number; survived: boolean }[];
}) {
  if (rows.length === 0) return <Empty>No cohort members</Empty>;
  return (
    <ul>
      {rows.map((m) => (
        <li key={m.artistId} className="flex items-baseline gap-2 border-b border-line/50 px-3 py-1.5 text-xs">
          <ArtistLink id={m.artistId} name={m.name} className="truncate text-fg-dim" />
          {!m.survived && <span className="label shrink-0 text-down">delisted</span>}
          <span className={`num ml-auto shrink-0 ${toneClass(m.ret)}`}>{fmtSignedPct(m.ret)}</span>
        </li>
      ))}
    </ul>
  );
}
