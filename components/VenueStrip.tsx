"use client";

import { useState } from "react";
import type { ResolvedMedia } from "@/lib/content";
import Lightbox from "./Lightbox";
import { Tile } from "./MediaGrid";

export default function VenueStrip({ items }: { items: ResolvedMedia[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const shown = items.slice(0, 4);
  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {shown.map((m, i) => (
          <div key={m.src} className="aspect-square">
            <Tile item={m} onClick={() => setOpen(i)} className="h-full" />
          </div>
        ))}
      </div>
      {items.length > 4 && <p className="eyebrow mt-2 text-right">+{items.length - 4} more</p>}
      <Lightbox items={items} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />
    </>
  );
}
