/**
 * xcadence wordmark.
 *
 * The mark is a rising trace with a lit tip — a price line rather than a
 * generic swoosh, so it reads as market movement at 16px. It is deliberately
 * small: it sits beside the wordmark rather than competing with it, because
 * this chrome sits above a screen that is already dense with live figures.
 *
 * The leading `x` carries the accent colour and the rest of the word does not,
 * which is the whole identity — no second typeface, no container, nothing that
 * needs redrawing at another size.
 */
export function Logo({
  size = 15,
  showMark = true,
  className = "",
}: {
  size?: number;
  showMark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {showMark && <LogoMark height={Math.round(size * 0.92)} />}
      <span
        className="font-semibold leading-none tracking-[0.16em]"
        style={{ fontSize: size }}
      >
        <span className="text-accent">x</span>
        <span className="text-fg">cadence</span>
      </span>
    </span>
  );
}

/** The trace on its own, for the favicon and anywhere the wordmark is too wide. */
export function LogoMark({ height = 14 }: { height?: number }) {
  return (
    <svg
      viewBox="0 0 26 18"
      height={height}
      width={(height * 26) / 18}
      fill="none"
      aria-hidden="true"
      style={{ display: "block", overflow: "visible" }}
    >
      <polyline
        points="1,14 6,10.5 10,12.5 14,6 18,8.5 24,2.5"
        stroke="currentColor"
        className="text-accent"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="2.5" r="2.4" className="fill-accent" />
    </svg>
  );
}
