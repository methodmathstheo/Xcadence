import type { Metadata } from "next";
import { venues, mediaForVenue, formatDate } from "@/lib/content";
import VenueStrip from "@/components/VenueStrip";

export const metadata: Metadata = { title: "Venues · Henry Hamilton" };

export default function Venues() {
  const byYear = new Map<string, typeof venues>();
  for (const v of venues) {
    const y = v.dates[v.dates.length - 1].slice(0, 4);
    byYear.set(y, [...(byYear.get(y) ?? []), v]);
  }

  return (
    <section className="px-5 pb-24 pt-28 sm:px-8 lg:px-12 lg:pt-36">
      <div className="mb-16 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="display text-5xl sm:text-6xl lg:text-7xl">Played at</h1>
        <p className="mono">{venues.length} venues · UK and abroad</p>
      </div>

      {[...byYear.entries()].map(([year, list]) => (
        <div key={year} className="grid gap-6 border-t hairline py-12 lg:grid-cols-12">
          <p className="display reveal text-2xl text-bone-2 lg:col-span-2">{year}</p>
          <ol className="lg:col-span-10">
            {list.map((v) => {
              const media = mediaForVenue(v.id);
              return (
                <li key={v.id} id={v.id} className="reveal scroll-mt-28 border-b hairline py-8 last:border-b-0">
                  <div className="grid gap-6 lg:grid-cols-10">
                    <div className="lg:col-span-6">
                      <h2 className="display text-4xl leading-none sm:text-5xl">
                        {v.handle ? (
                          <a href={`https://www.instagram.com/${v.handle}/`} target="_blank" rel="noreferrer" className="hover:text-acid transition-colors">
                            {v.name}
                          </a>
                        ) : (
                          v.name
                        )}
                      </h2>
                      <p className="mt-3 text-sm text-bone-2">
                        {v.location}
                        {v.event ? ` · ${v.event}` : ""}
                      </p>
                      <p className="mono mt-3">
                        {v.dates.length > 1
                          ? `${v.dates.length} appearances · ${formatDate(v.dates[0])} to ${formatDate(v.dates[v.dates.length - 1])}`
                          : formatDate(v.dates[0], { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                      {v.note && <p className="mt-4 max-w-md text-sm leading-relaxed text-bone-2">{v.note}</p>}
                    </div>
                    <div className="lg:col-span-4">{media.length > 0 && <VenueStrip items={media} />}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}
