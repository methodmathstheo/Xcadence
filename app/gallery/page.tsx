import type { Metadata } from "next";
import { allMedia } from "@/lib/content";
import MediaGrid from "@/components/MediaGrid";

export const metadata: Metadata = { title: "Gallery · Henry Hamilton" };

export default function Gallery() {
  return (
    <section className="px-5 pb-24 pt-28 sm:px-8 lg:px-12 lg:pt-36">
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="display text-5xl sm:text-6xl lg:text-7xl">Gallery</h1>
        <p className="mono">{allMedia.length} frames · from Instagram</p>
      </div>
      <MediaGrid items={allMedia} />
    </section>
  );
}
