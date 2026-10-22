"use client";

import { useState } from "react";
import type { ResolvedMedia } from "@/lib/content";
import Lightbox from "./Lightbox";
import { Tile } from "./MediaGrid";

export default function FeaturedStrip({ items }: { items: ResolvedMedia[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
        {items.map((m, i) => (
          <div key={m.src} className="reveal w-[72vw] shrink-0 snap-start sm:w-[42vw] lg:w-[28vw]" style={{ transitionDelay: `${i * 60}ms` }}>
            <div className="aspect-[4/5]">
              <Tile item={m} onClick={() => setOpen(i)} className="h-full" />
            </div>
          </div>
        ))}
      </div>
      <Lightbox items={items} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />
    </>
  );
}
