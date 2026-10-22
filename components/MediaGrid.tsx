"use client";

import { useMemo, useState } from "react";
import type { ResolvedMedia } from "@/lib/content";
import Lightbox from "./Lightbox";

type Filter = "all" | "photos" | "videos";

export function Tile({ item, onClick, className = "" }: { item: ResolvedMedia; onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`group relative block w-full overflow-hidden bg-ink-2 text-left ${className}`}
      aria-label={item.alt}
    >
      {item.videoSrc ? (
        <video
          src={item.videoSrc}
          poster={item.src}
          muted
          loop
          playsInline
          preload="metadata"
          onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
          onMouseLeave={(e) => {
            e.currentTarget.pause();
            e.currentTarget.currentTime = 0;
          }}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.src}
          alt={item.alt}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
      )}
      {item.video && (
        <span className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-ink/60 backdrop-blur">
          <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden>
            <path d="M0 0l10 6-10 6z" />
          </svg>
        </span>
      )}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
    </button>
  );
}

export default function MediaGrid({ items, filters = true }: { items: ResolvedMedia[]; filters?: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);

  const shown = useMemo(
    () => items.filter((m) => (filter === "all" ? true : filter === "videos" ? m.video : !m.video)),
    [items, filter],
  );

  return (
    <>
      {filters && (
        <div className="mb-8 flex gap-6">
          {(["all", "photos", "videos"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="eyebrow transition-colors hover:text-bone"
              style={filter === f ? { color: "var(--color-brass)" } : undefined}
            >
              {f}
            </button>
          ))}
        </div>
      )}
      <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3 [&>*]:break-inside-avoid">
        {shown.map((m, i) => (
          <div key={m.src + i} className="reveal">
            <Tile item={m} onClick={() => setOpen(i)} />
          </div>
        ))}
      </div>
      <Lightbox items={shown} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />
    </>
  );
}
