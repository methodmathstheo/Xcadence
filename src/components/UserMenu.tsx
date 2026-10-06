"use client";

import { useState } from "react";
import Link from "next/link";
import type { SessionUser } from "@/lib/auth/session";

/** Who you are trading as, and the way out. */
export function UserMenu({ user }: { user: SessionUser | null }) {
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "signout" }),
    }).catch(() => {});
    // A document load, for the same reason as signing in: router.replace()
    // followed by router.refresh() race each other, and the one that loses is
    // the navigation. This also guarantees the client router cache is dropped
    // rather than keeping a signed-in tree around after the cookie is gone.
    window.location.assign("/");
  }

  return (
    <div className="ml-auto flex items-center gap-3 pl-4">
      {user.isGuest ? (
        <>
          <span
            className="label hidden border border-accent/40 px-1.5 py-px text-[9px] text-accent sm:inline"
            title="Nothing in a guest book is kept. It is deleted a day after you stop using it."
          >
            Guest
          </span>
          <Link
            href="/login?mode=register"
            className="hidden text-xs text-accent transition-opacity hover:opacity-80 sm:block"
          >
            Keep this book
          </Link>
        </>
      ) : (
        <span
          className="hidden max-w-[16ch] truncate text-xs text-fg-dim sm:block"
          title={user.email}
        >
          {user.displayName}
        </span>
      )}
      <button
        onClick={signOut}
        disabled={busy}
        className="label border border-line px-2 py-1 transition-colors hover:border-line-2 hover:text-fg-dim disabled:opacity-50"
      >
        {busy ? "…" : "Sign out"}
      </button>
    </div>
  );
}
