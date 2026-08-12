"use client";

import type { StreamFrame, TapeEntry } from "@/lib/engine/types";

export interface Quote {
  price: number;
  prev: number;
  listeners: number;
  /** Wall-clock ms of the last change, used to drive the flash class. */
  changedAt: number;
  dir: 1 | -1 | 0;
}

/**
 * External store fed by the SSE connection.
 *
 * Deliberately not React state: a frame can touch hundreds of markets a second,
 * and putting that through context would re-render the tree per quote. Views
 * subscribe once, re-render at most once per frame, and read quotes directly.
 */
class MarketStore {
  quotes = new Map<number, Quote>();
  clock = { simMs: 0, tick: 0, speed: 1440, running: false, wallMs: 0 };
  index = { equal: 100, weighted: 100 };
  account = {
    cash: 0,
    equity: 0,
    marketValue: 0,
    realisedPnl: 0,
    unrealisedPnl: 0,
    sessionPnl: 0,
  };
  tape: TapeEntry[] = [];
  connected = false;
  version = 0;

  private listeners = new Set<() => void>();
  private source: EventSource | null = null;
  private refCount = 0;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.version;
  getServerSnapshot = () => 0;

  private notify() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  /** Opens one connection for the whole app, however many views mount. */
  connect() {
    this.refCount++;
    if (this.source) return;
    const es = new EventSource("/api/stream");
    this.source = es;

    es.addEventListener("snapshot", (ev) => {
      this.apply(JSON.parse((ev as MessageEvent).data) as StreamFrame, true);
      this.connected = true;
      this.notify();
    });
    es.onmessage = (ev) => {
      this.apply(JSON.parse(ev.data) as StreamFrame, false);
      this.connected = true;
      this.notify();
    };
    es.onerror = () => {
      // EventSource reconnects on its own; surface the gap in the UI meanwhile.
      this.connected = false;
      this.notify();
    };
  }

  disconnect() {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0 && this.source) {
      this.source.close();
      this.source = null;
    }
  }

  private apply(f: StreamFrame, full: boolean) {
    this.clock = {
      simMs: f.simMs,
      tick: f.tick,
      speed: f.speed,
      running: f.running,
      wallMs: f.wallMs,
    };
    this.index = f.index;
    this.account = f.account;
    if (f.tape) this.tape = f.tape;

    const now = Date.now();
    for (const [id, price, prev, listeners] of f.prices) {
      const existing = this.quotes.get(id);
      const before = existing?.price ?? prev;
      this.quotes.set(id, {
        price,
        prev,
        listeners,
        changedAt: full || price === before ? existing?.changedAt ?? 0 : now,
        dir: price > before ? 1 : price < before ? -1 : existing?.dir ?? 0,
      });
    }
  }

  /** Live quote, falling back to the server-rendered value before first frame. */
  quote(id: number, fallback: number, fallbackListeners = 0): Quote {
    return (
      this.quotes.get(id) ?? {
        price: fallback,
        prev: fallback,
        listeners: fallbackListeners,
        changedAt: 0,
        dir: 0,
      }
    );
  }
}

const g = globalThis as unknown as { __cadenceStore?: MarketStore };
export const marketStore = (g.__cadenceStore ??= new MarketStore());
export type { MarketStore };
