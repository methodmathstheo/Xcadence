"use client";

import { useState } from "react";

/**
 * "Try as a guest" — a funded book without an email or a password.
 *
 * Posts straight to the auth endpoint rather than routing through the login
 * page, because the whole point is that there is no form to fill in. The
 * navigation is a document load for the same reason the login form uses one:
 * the session cookie has to be in play when the server renders the venue.
 */
export function GuestButton({ className = "" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function start() {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "guest" }),
      });
      if (!res.ok) throw new Error("guest session refused");
      // Left busy on purpose: the page is on its way out, and resetting the
      // label reads as the click having been ignored.
      window.location.assign("/markets");
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-center">
      <button
        onClick={start}
        disabled={busy}
        className={`rounded-full border border-accent/60 px-6 py-2.5 text-[13px] text-accent transition-colors hover:bg-accent/10 disabled:opacity-60 ${className}`}
      >
        {busy ? "Opening a book…" : "Try as a guest"}
      </button>
      {error && (
        <span className="mt-2 text-[10px] text-down">
          Could not start a guest session. Try again.
        </span>
      )}
    </span>
  );
}
