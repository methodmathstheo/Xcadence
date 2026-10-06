"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/auth/session";

/** Who you are trading as, and the way out. */
export function UserMenu({ user }: { user: SessionUser | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "signout" }),
    }).catch(() => {});
    // replace, not push: the venue should not be reachable with Back after
    // signing out, even though the proxy would bounce it anyway.
    router.replace("/welcome");
    router.refresh();
  }

  return (
    <div className="ml-auto flex items-center gap-3 pl-4">
      <span
        className="hidden max-w-[16ch] truncate text-xs text-fg-dim sm:block"
        title={user.email}
      >
        {user.displayName}
      </span>
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
