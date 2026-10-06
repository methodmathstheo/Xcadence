"use client";

import { usePathname } from "next/navigation";
import { Nav } from "@/components/Nav";
import { ClockBar } from "@/components/ClockBar";
import { TickerBar } from "@/components/TickerBar";
import type { SessionUser } from "@/lib/auth/session";

/**
 * The trading chrome — nav, clock, ticker — hidden on the sign-in screen.
 *
 * A pathname check rather than a route group: the clock bar and ticker open
 * the SSE stream as a side effect of mounting, and a signed-out visitor has no
 * book for it to populate.
 */
export function VenueChrome({
  user,
  owner,
}: {
  user: SessionUser | null;
  owner: boolean;
}) {
  const path = usePathname();
  if (path === "/welcome") return null;
  return (
    <>
      <Nav user={user} />
      <ClockBar owner={owner} />
      <TickerBar />
    </>
  );
}
