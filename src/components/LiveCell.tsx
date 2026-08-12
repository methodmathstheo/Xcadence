"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders a value and flashes green or red for one beat whenever it changes.
 * The flash class is removed after the animation so a value that changes twice
 * in quick succession flashes twice rather than sticking.
 */
export function LiveCell({
  value,
  render,
  className = "",
  digits = 2,
}: {
  value: number;
  render?: (v: number) => string;
  className?: string;
  digits?: number;
}) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<"" | "flash-up" | "flash-down">("");

  useEffect(() => {
    const delta = value - prev.current;
    prev.current = value;
    if (Math.abs(delta) < 1e-9) return;
    const cls = delta > 0 ? "flash-up" : "flash-down";
    setFlash("");
    const raf = requestAnimationFrame(() => setFlash(cls));
    const timer = setTimeout(() => setFlash(""), 640);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [value]);

  return (
    <span className={`num inline-block px-1 ${flash} ${className}`}>
      {render ? render(value) : value.toFixed(digits)}
    </span>
  );
}
