"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";

const LINKS: [string, string][] = [
  ["/", "Rankings"],
  ["/trade", "Trading"],
  ["/exchange", "Exchange"],
  ["/portfolio", "Portfolio"],
  ["/offerings", "Offerings"],
  ["/lab", "Quant lab"],
  ["/methodology", "Methodology"],
  ["/inspector", "Run inspector"],
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex items-center gap-0 border-b border-line bg-ink px-4">
      <Link href="/" className="mr-6 flex items-center gap-2.5 py-2">
        <Logo size={15} />
        <span className="label hidden sm:inline">Royalty Exchange</span>
      </Link>
      <span
        className="label mr-4 border border-accent/40 px-1.5 py-px text-accent"
        title="Every price, listener count and royalty figure in this application is generated."
      >
        Simulated
      </span>
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
