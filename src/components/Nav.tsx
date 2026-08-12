"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: [string, string][] = [
  ["/", "Rankings"],
  ["/trade", "Trading"],
  ["/offerings", "Offerings"],
  ["/lab", "Quant lab"],
  ["/methodology", "Methodology"],
  ["/inspector", "Run inspector"],
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex items-center gap-0 border-b border-line bg-ink px-4">
      <Link href="/" className="mr-6 flex items-baseline gap-2 py-2">
        <span className="text-sm font-semibold tracking-[0.2em] text-accent">CADENCE</span>
        <span className="label hidden sm:inline">Royalty Exchange</span>
      </Link>
      {LINKS.map(([href, label]) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`border-b-2 px-3 py-2.5 text-xs transition-colors ${
              active
                ? "border-accent text-fg"
                : "border-transparent text-fg-mute hover:text-fg-dim"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
