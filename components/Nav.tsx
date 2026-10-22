"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Home" },
  { href: "/gallery", label: "Gallery" },
  { href: "/venues", label: "Venues" },
  { href: "/#book", label: "Book" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="fixed inset-x-0 top-0 z-40 mix-blend-difference">
      <nav className="flex items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <Link href="/" className="serif text-xl leading-none tracking-tight">
          HH
        </Link>
        <ul className="flex items-center gap-5 sm:gap-8">
          {tabs.map((t) => {
            const active = t.href === "/" ? path === "/" : path.startsWith(t.href.replace("/#book", "/__never"));
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className={`eyebrow transition-colors duration-300 hover:text-bone ${active ? "text-bone" : ""}`}
                  style={active ? { color: "var(--color-brass)" } : undefined}
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
