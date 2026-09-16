/**
 * Xcadence wordmark — logo direction 1a, "ledger bars".
 *
 * Five rounded bars at the heights from the brand sheet (42 / 59 / 78 / 51 /
 * 93%), alternating Neutral and Accent so the two tallest carry the violet.
 * It is a ledger, not a rising line: the heights are deliberately not
 * monotonic, because this venue's whole argument is that the tall bars are the
 * exception rather than the trend.
 *
 * The wordmark itself is one weight in Ink. The colour lives in the mark,
 * which is what lets the same lockup sit on a light pill or a dark bar without
 * being redrawn.
 */
const BARS = [
  { h: 0.42, tone: "dim" },
  { h: 0.59, tone: "neutral" },
  { h: 0.78, tone: "accent" },
  { h: 0.51, tone: "neutral" },
  { h: 0.93, tone: "accent" },
] as const;

const TONE: Record<string, string> = {
  dim: "#9497a9",
  neutral: "#b3b6c8",
  accent: "#8f84d3",
};

export function Logo({
  size = 15,
  showMark = true,
  showTagline = false,
  className = "",
}: {
  size?: number;
  showMark?: boolean;
  showTagline?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {showMark && <LogoMark height={Math.round(size * 1.05)} />}
      <span className="inline-flex flex-col justify-center">
        <span
          className="font-semibold leading-none tracking-[-0.01em] text-fg"
          style={{ fontSize: size }}
        >
          Xcadence
        </span>
        {showTagline && (
          <span
            className="mt-[3px] leading-none text-fg-mute"
            style={{ fontSize: Math.max(7, size * 0.42), letterSpacing: "0.22em" }}
          >
            ROYALTIES EXCHANGE
          </span>
        )}
      </span>
    </span>
  );
}

/** The bars alone, for the favicon and anywhere the wordmark will not fit. */
export function LogoMark({ height = 16 }: { height?: number }) {
  const W = 24;
  const H = 20;
  const barW = 3.4;
  const gap = (W - BARS.length * barW) / (BARS.length - 1);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      height={height}
      width={(height * W) / H}
      fill="none"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      {BARS.map((b, i) => {
        const h = b.h * H;
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={H - h}
            width={barW}
            height={h}
            rx={barW / 2}
            fill={TONE[b.tone]}
          />
        );
      })}
    </svg>
  );
}
