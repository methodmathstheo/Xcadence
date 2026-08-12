"use client";

import { useState } from "react";

/**
 * Artist avatar. A real photo where one exists, otherwise a monogram.
 *
 * The monogram is not a placeholder to be replaced later — most artists in the
 * universe are generated and have no photograph anywhere. It is derived
 * deterministically from the name so a given artist always looks the same, and
 * carries enough colour variation to be useful for picking a row out of a
 * table at a glance.
 */
export function Avatar({
  name,
  src,
  size = 28,
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  const { initials, hue } = monogram(name);

  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: showImage
          ? "var(--color-panel-2)"
          : `linear-gradient(140deg, hsl(${hue} 42% 30%), hsl(${(hue + 40) % 360} 38% 18%))`,
        border: "1px solid var(--color-line-2)",
      }}
      title={name}
    >
      {showImage ? (
        // Plain <img>: these are remote Spotify CDN URLs, and routing them
        // through next/image would need the host allow-listed and would
        // proxy every avatar through the server for no benefit here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: size, height: size, objectFit: "cover" }}
        />
      ) : (
        <span
          className="num font-medium"
          style={{
            fontSize: Math.max(9, Math.round(size * 0.36)),
            color: `hsl(${hue} 55% 78%)`,
            letterSpacing: "0.02em",
          }}
        >
          {initials}
        </span>
      )}
    </span>
  );
}

function monogram(name: string): { initials: string; hue: number } {
  const clean = name.replace(/^The\s+/i, "").trim();
  const words = clean.split(/[\s&]+/).filter(Boolean);
  const initials =
    words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : clean.slice(0, 2).toUpperCase();

  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return { initials, hue: h % 360 };
}
