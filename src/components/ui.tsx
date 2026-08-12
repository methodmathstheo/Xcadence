import Link from "next/link";
import type { ReactNode } from "react";

export function Panel({
  title,
  right,
  children,
  className = "",
  bodyClass = "",
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={`panel flex min-w-0 flex-col ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-3 py-1.5">
          <h2 className="label">{title}</h2>
          {right}
        </header>
      )}
      <div className={`min-w-0 flex-1 ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  tone = "",
  sub,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  sub?: ReactNode;
}) {
  return (
    <div className="bg-panel px-3 py-2">
      <div className="label">{label}</div>
      <div className={`num mt-0.5 text-sm ${tone || "text-fg"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-fg-mute">{sub}</div>}
    </div>
  );
}

const TIER_TONE: Record<string, string> = {
  superstar: "border-violet/50 text-violet",
  established: "border-cyan/50 text-cyan",
  emerging: "border-accent/50 text-accent",
  dormant: "border-line-2 text-fg-mute",
};

export function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      className={`label inline-block border px-1.5 py-px ${TIER_TONE[tier] ?? TIER_TONE.dormant}`}
    >
      {tier}
    </span>
  );
}

export function ArtistLink({
  id,
  name,
  className = "",
}: {
  id: number;
  name: string;
  className?: string;
}) {
  return (
    <Link href={`/artist/${id}`} className={`hover:text-accent ${className}`}>
      {name}
    </Link>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="label px-3 py-8 text-center">{children}</div>;
}
