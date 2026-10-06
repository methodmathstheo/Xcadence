"use client";

import { useEffect, useRef, useState } from "react";
import { RNG } from "@/lib/rng";
import {
  initialCandles, initialTicks, nextCandle, stepTicks, type Candle, type Tick,
} from "@/lib/landing/synthetic";

/** Period of the landing page's own clock. Slow enough to read a number. */
const PERIOD = 900;

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Runs a callback on an interval, but only while the tab is visible and the
 * element is on screen.
 *
 * A marketing page is left open in a background tab for hours. Walking a
 * price series the whole time would burn a phone battery to animate something
 * nobody is looking at.
 */
function useVisibleInterval(
  ref: React.RefObject<HTMLElement | null>,
  fn: () => void,
  period = PERIOD,
) {
  const cb = useRef(fn);
  cb.current = fn;

  useEffect(() => {
    if (reducedMotion()) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let onScreen = !ref.current;

    const sync = () => {
      const run = onScreen && !document.hidden;
      if (run && !timer) timer = setInterval(() => cb.current(), period);
      if (!run && timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const el = ref.current;
    const io = el
      ? new IntersectionObserver(([e]) => {
          onScreen = e.isIntersecting;
          sync();
        })
      : null;
    io?.observe(el!);
    document.addEventListener("visibilitychange", sync);
    sync();

    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      if (timer) clearInterval(timer);
    };
  }, [ref, period]);
}

/** A walking set of quotes for the ticker and the rankings panel. */
export function useTicks(ref: React.RefObject<HTMLElement | null>, seed = 20260901) {
  const [ticks, setTicks] = useState<Tick[]>(() => initialTicks(seed));
  const rng = useRef(new RNG(seed ^ 0x5bf03635));
  useVisibleInterval(ref, () => setTicks((t) => stepTicks(t, rng.current)));
  return ticks;
}

/** A candle series with a bar forming on the right edge. */
export function useCandles(
  ref: React.RefObject<HTMLElement | null>,
  count = 48,
  seed = 7781,
) {
  const [candles, setCandles] = useState<Candle[]>(() => initialCandles(count, seed));
  const rng = useRef(new RNG(seed ^ 0x1f123bb5));

  useVisibleInterval(
    ref,
    () =>
      setCandles((cs) => {
        const next = [...cs, nextCandle(cs[cs.length - 1].c, rng.current)];
        // Fixed window, so the chart scrolls rather than compressing — the
        // candles keep the same width however long the page is left open.
        return next.slice(-count);
      }),
    1500,
  );

  return candles;
}

/**
 * A simulated clock reading, advancing a day every two seconds.
 *
 * Starts from a fixed date rather than `Date.now()`: the server and the client
 * have to render the same string, and "now" is the one value they never agree
 * on.
 */
export function useSimDate(ref: React.RefObject<HTMLElement | null>) {
  const [days, setDays] = useState(0);
  // One day every two seconds, which is what 43200x actually looks like: a
  // month a minute. The panel advertises that speed, so it has to run at it.
  useVisibleInterval(ref, () => setDays((d) => d + 1), 2000);
  const t = Date.UTC(2029, 2, 14) + days * 86_400_000;
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
      d.getUTCMonth()
    ]
  } ${d.getUTCFullYear()}`;
}
