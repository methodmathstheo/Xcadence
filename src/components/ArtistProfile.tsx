"use client";

import { Avatar } from "@/components/Avatar";
import { Panel, TierBadge } from "@/components/ui";
import { EVENT_LABEL } from "@/lib/sim/constants";
import { fmtCompact, fmtListeners, fmtPct } from "@/lib/format";
import { fmtSimDate } from "@/lib/sim/time";

export interface ProfilePayload {
  source: "open" | "unavailable";
  avatar: string | null;
  identity: {
    mbid: string | null; bio: string | null; bioUrl: string | null;
    area: string | null; beginYear: number | null;
  } | null;
  about: {
    genre: string; tier: string; debutMs: number; debutLabel: string; active: boolean;
    exitMs: number | null; exitReason: string | null; monthsListed: number;
    listeners: number; peakListeners: number; peakMonthMs: number;
    bestRank: number | null; volatility: number; monthlyRoyalty: number;
    notable: { tMs: number; kind: string; headline: string }[];
  };
  releases: Release[];
}

interface Release {
  title: string;
  type: string;
  year: number | null;
  date: string | null;
  mbid: string;
  coverUrl: string | null;
}

export function ArtistHeader({
  name,
  profile,
}: {
  name: string;
  profile: ProfilePayload | null;
}) {
  return <Avatar name={name} src={profile?.avatar} size={64} />;
}

/**
 * About: the real biography first, then the simulated career beneath it,
 * separated so it is never ambiguous which is which.
 */
export function AboutPanel({ profile }: { profile: ProfilePayload | null }) {
  if (!profile) return <div className="label px-3 py-8 text-center">Loading profile…</div>;
  const a = profile.about;
  const id = profile.identity;
  const trajectory =
    a.listeners >= a.peakListeners * 0.95
      ? "at or near their simulated peak"
      : a.listeners >= a.peakListeners * 0.5
        ? `down from a simulated peak of ${fmtListeners(a.peakListeners)}`
        : `well below a simulated peak of ${fmtListeners(a.peakListeners)}`;

  return (
    <Panel title="About" bodyClass="p-4">
      {id?.bio ? (
        <>
          <p className="text-sm leading-relaxed text-fg">{id.bio}</p>
          <p className="label mt-2">
            {[id.area, id.beginYear ? `active from ${id.beginYear}` : null]
              .filter(Boolean)
              .join(" · ")}
            {id.bioUrl && (
              <>
                {" · "}
                <a
                  href={id.bioUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-cyan hover:underline"
                >
                  Wikipedia ↗
                </a>
              </>
            )}
          </p>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-fg-mute">
          No biography found for this name in the open sources. Nothing is written here in its
          place.
        </p>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <div className="label mb-2">In this simulation</div>
        <p className="text-xs leading-relaxed text-fg-dim">
          Listed {a.debutLabel} in <span className="text-fg">{a.genre}</span>, currently{" "}
          <TierBadge tier={a.tier} />. {a.monthsListed} months on the exchange,{" "}
          {fmtListeners(a.listeners)} monthly listeners — {trajectory}
          {a.bestRank ? `, best rank #${a.bestRank}` : ""}.{" "}
          {a.active ? (
            <>
              Royalties running at {fmtCompact(a.monthlyRoyalty)} credits a month against{" "}
              {fmtPct(a.volatility, 0)} annualised volatility.
            </>
          ) : (
            <span className="text-down">
              Delisted {a.exitMs ? fmtSimDate(a.exitMs) : "—"}
              {a.exitReason ? ` (${a.exitReason})` : ""}; contracts pay nothing from that date.
            </span>
          )}
        </p>
      </div>

      {a.notable.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="label mb-2">Simulated career events</div>
          <ul className="space-y-1">
            {a.notable.map((e, i) => (
              <li key={i} className="flex items-baseline gap-2 text-xs">
                <span className="num shrink-0 text-fg-mute">{fmtSimDate(e.tMs)}</span>
                <span className="label w-24 shrink-0">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                <span className="truncate text-fg-dim">{e.headline}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-fg-mute">
        The biography, photograph and discography are real, from Wikipedia and MusicBrainz.
        Everything under <span className="text-fg-dim">In this simulation</span> is not: listener
        counts, royalties, tier, volatility, rank and every event listed are output from a seeded
        random number generator and describe nobody.
      </p>
    </Panel>
  );
}

/** Discography. Real release groups from MusicBrainz, sleeves from the CAA. */
export function DiscographyPanel({ profile }: { profile: ProfilePayload | null }) {
  if (!profile) return null;
  const releases: Release[] = profile.releases ?? [];

  if (releases.length === 0) {
    return (
      <Panel title="Discography" right={<span className="label">real releases only</span>}>
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-fg-dim">No catalogue found for this name.</p>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-fg-mute">
            MusicBrainz returned no exact match, so nothing is shown. A catalogue is not something
            this application will invent for a real person.
          </p>
        </div>
      </Panel>
    );
  }

  const albums = releases.filter((r) => r.type === "album").length;
  return (
    <Panel
      title="Discography"
      right={
        <span className="label">
          MusicBrainz · {releases.length} releases · {albums} albums
        </span>
      }
      bodyClass="max-h-[520px] overflow-auto p-3"
    >
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {releases.map((r) => (
          <li key={r.mbid}>
            <a
              href={`https://musicbrainz.org/release-group/${r.mbid}`}
              target="_blank"
              rel="noreferrer noopener"
              className="block hover:opacity-80"
            >
              <span
                className="mb-2 block aspect-square w-full overflow-hidden border border-line-2"
                style={{ background: coverGradient(r.title) }}
              >
                {r.coverUrl && (
                  // Cover Art Archive 404s where no sleeve exists; the onError
                  // hides the image and the gradient behind it shows through.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.coverUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
              </span>
              <span className="block truncate text-xs text-fg" title={r.title}>
                {r.title}
              </span>
              <span className="label mt-0.5 block">
                {r.type} · {r.year ?? "—"}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Deterministic sleeve art for generated releases. */
function coverGradient(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 55) % 360;
  return `linear-gradient(145deg, hsl(${a} 34% 26%), hsl(${b} 30% 12%))`;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-fg-mute">{k}</dt>
      <dd className="num text-fg">{v}</dd>
    </div>
  );
}
