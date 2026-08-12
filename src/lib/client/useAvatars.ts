"use client";

import { useEffect, useState } from "react";

interface AvatarState {
  avatars: Record<number, string>;
  configured: boolean;
  resolved: number;
  rosterCount: number;
  pending: number;
}

const EMPTY: AvatarState = {
  avatars: {},
  configured: false,
  resolved: 0,
  rosterCount: 0,
  pending: 0,
};

// One shared cache for the tab. Several tables mount this hook and there is no
// reason for each to fetch the same map.
let shared: AvatarState = EMPTY;
let inFlight: Promise<void> | null = null;
const subscribers = new Set<(s: AvatarState) => void>();

async function refresh() {
  if (inFlight) return inFlight;
  inFlight = fetch("/api/avatars")
    .then((r) => r.json())
    .then((d: AvatarState) => {
      shared = d;
      for (const fn of subscribers) fn(d);
    })
    .catch(() => {})
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Artist photos, keyed by id. Empty until Spotify credentials are configured,
 * at which point the map fills in over a few polls as the cache warms.
 */
export function useAvatars(): AvatarState {
  const [state, setState] = useState(shared);

  useEffect(() => {
    subscribers.add(setState);
    void refresh();
    return () => {
      subscribers.delete(setState);
    };
  }, []);

  useEffect(() => {
    if (!state.configured || state.pending <= 0) return;
    const t = setTimeout(() => void refresh(), 4000);
    return () => clearTimeout(t);
  }, [state.configured, state.pending, state.resolved]);

  return state;
}
