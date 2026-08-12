"use client";

import { useEffect, useSyncExternalStore } from "react";
import { marketStore } from "@/lib/client/market-store";

/**
 * Subscribes the calling component to the live feed. Returns the store itself;
 * the returned version number is what actually drives the re-render.
 */
export function useMarket() {
  useSyncExternalStore(
    marketStore.subscribe,
    marketStore.getSnapshot,
    marketStore.getServerSnapshot,
  );
  useEffect(() => {
    marketStore.connect();
    return () => marketStore.disconnect();
  }, []);
  return marketStore;
}

/** Fires a clock control and resolves once the engine has applied it. */
export async function clockAction(body: Record<string, unknown>) {
  const res = await fetch("/api/clock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
