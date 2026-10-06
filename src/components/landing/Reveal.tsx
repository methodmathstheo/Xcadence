"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * `useLayoutEffect` on the client, `useEffect` on the server.
 *
 * The hide has to happen before the browser paints or the section is visible
 * for a frame and then snaps away, which is worse than no animation. React
 * warns about useLayoutEffect during SSR, so it is swapped out there — where
 * it would never run anyway.
 */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Fade-and-rise as a section enters the viewport.
 *
 * Only applies to sections that start below the fold. Content already in the
 * viewport on load renders immediately and never animates, so nothing the
 * visitor can already see is held back.
 *
 * Starts visible and is only hidden once the observer is attached, so the page
 * is fully readable with JavaScript off and nothing can get stuck invisible if
 * the observer never fires. Honours `prefers-reduced-motion` by skipping the
 * transition outright rather than shortening it.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"static" | "hidden" | "shown">("static");

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Anything already on screen when the page loads is left alone. The
    // animation is there to give scrolling some life, not to make someone
    // wait to read the first thing they see — hiding the hero and fading it
    // back in is a delay with nothing behind it.
    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) return;

    setState("hidden");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("shown");
          io.disconnect();
        }
      },
      // Fires a little before the section reaches the fold, so the motion
      // reads as the page settling rather than as content arriving late.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={
        state === "static"
          ? undefined
          : {
              opacity: state === "shown" ? 1 : 0,
              transform: state === "shown" ? "none" : "translateY(18px)",
              transition: `opacity 700ms cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 700ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
            }
      }
    >
      {children}
    </div>
  );
}
