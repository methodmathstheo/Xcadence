"use client";

import { useState } from "react";

type Mode = "signin" | "register";

/**
 * Sign in and create account, one panel.
 *
 * Both actions hit the same endpoint and land in the same place, so there is
 * no reason to split them across two routes — and a visitor arriving on a
 * shared link usually doesn't know yet which of the two they need.
 */
export function AuthPanel({
  next,
  initialMode = "register",
}: {
  next: string;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(action: Mode | "guest") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, email, password, displayName }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? "Something went wrong. Try again.");
        setBusy(false);
        return;
      }

      // Single leading slash only. A crafted `?next=//evil.example` is a
      // protocol-relative URL that the browser treats as another origin, so
      // checking for "/" alone is not enough to keep the redirect internal.
      const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/markets";

      // A full document navigation, not router.replace().
      //
      // This is the fix for sign-in appearing to need two or three goes. The
      // old code called router.replace() and then router.refresh(), and the
      // refresh invalidates the tree the replace is still navigating — the
      // navigation loses, and you are left sitting on the form with a session
      // cookie already set and no sign that anything happened. A document
      // load cannot race itself, and it guarantees the layout re-renders
      // server-side with the new session rather than from the router cache.
      //
      // `busy` is deliberately left set: the page is on its way out, and
      // flipping the button back to "Open an account" in the meantime reads
      // as the click having been ignored.
      window.location.assign(safe);
    } catch {
      setError("Could not reach the exchange. Check your connection.");
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void send(mode);
  }

  return (
    <div className="panel h-fit self-center p-5">
      <div className="mb-5 grid grid-cols-2 gap-px bg-line">
        {(
          [
            ["register", "Create account"],
            ["signin", "Sign in"],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`px-3 py-2 text-xs transition-colors ${
              mode === m
                ? "bg-panel-2 text-fg"
                : "bg-panel text-fg-mute hover:text-fg-dim"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3.5">
        {mode === "register" && (
          <Field
            label="Display name"
            value={displayName}
            onChange={setDisplayName}
            type="text"
            autoComplete="nickname"
            placeholder="Optional"
          />
        )}
        <Field
          label="Email"
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="email"
          required
        />
        <Field
          label="Password"
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          required
          hint={mode === "register" ? "At least 8 characters." : undefined}
        />

        {error && (
          <p className="border-l-2 border-down pl-2.5 text-xs leading-relaxed text-down">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 bg-accent px-3 py-2.5 text-xs font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy
            ? "Working…"
            : mode === "register"
              ? "Open an account"
              : "Sign in"}
        </button>

        <p className="text-[10px] leading-relaxed text-fg-mute">
          Virtual currency only. No payment details are ever collected, and the
          credits in your account cannot be bought, sold or withdrawn.
        </p>
      </form>

      {/* Outside the form, so pressing Enter in a field never triggers it. */}
      <div className="mt-4 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => void send("guest")}
          disabled={busy}
          className="w-full border border-line-2 px-3 py-2 text-xs text-fg-dim transition-colors hover:border-accent hover:text-fg disabled:opacity-50"
        >
          Try as a guest
        </button>
        <p className="mt-2 text-[10px] leading-relaxed text-fg-mute">
          A funded book with no details asked for. It lasts a day and is then
          deleted — positions and all.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-line bg-ink px-2.5 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-mute focus:border-accent"
      />
      {hint && <span className="text-[10px] text-fg-mute">{hint}</span>}
    </label>
  );
}
