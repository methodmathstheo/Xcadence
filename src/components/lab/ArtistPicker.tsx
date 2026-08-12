"use client";

import { useMemo, useState } from "react";
import type { ArtistSummary } from "@/lib/data/provider";
import { fmtCredits, fmtListeners } from "@/lib/format";

export function ArtistPicker({
  artists,
  value,
  onChange,
}: {
  artists: ArtistSummary[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? artists.filter((a) => a.name.toLowerCase().includes(s)) : artists).slice(0, 200);
  }, [artists, q]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter…"
        className="w-40 border border-line-2 bg-panel-2 px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
      />
      <select
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className="num min-w-[260px] border border-line-2 bg-panel-2 px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
      >
        {list.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {fmtListeners(a.listeners)} · {fmtCredits(a.price)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <label className="flex min-w-[220px] flex-1 items-center gap-3">
      <span className="label w-32 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1"
      />
      <span className="num w-16 shrink-0 text-right text-xs text-fg">{format(value)}</span>
    </label>
  );
}
