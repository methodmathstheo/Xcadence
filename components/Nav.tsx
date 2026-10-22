"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Home" },
  { href: "/gallery", label: "Gallery" },
  { href: "/venues", label: "Venues" },
  { href: "/#listen", label: "Listen" },
  { href: "/#book", label: "Book" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <nav className="flex items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
        <Link href="/" className="display text-2xl leading-none text-bone">
          HH
        </Link>
        <ul className="flex items-center gap-4 sm:gap-7">
          {tabs.map((t) => {
            const isHash = t.href.includes("#");
            const active = !isHash && (t.href === "/" ? path === "/" : path.startsWith(t.href));
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className="mono transition-colors duration-300 hover:text-bone"
                  style={active ? { color: "var(--color-acid)" } : undefined}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
