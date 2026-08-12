"use client";

import Link from "next/link";
import { useMarket } from "@/lib/client/useMarket";
import { EVENT_LABEL } from "@/lib/sim/constants";
import { fmtCredits } from "@/lib/format";
import { fmtSimDate } from "@/lib/sim/time";
import { Empty } from "@/components/ui";

const EVENT_TONE: Record<string, string> = {
  viral: "text-up",
  breakout: "text-up",
  sync: "text-cyan",
  playlist: "text-cyan",
  debut: "text-violet",
  labeldrop: "text-down",
  exit: "text-down",
  payout: "text-accent",
  offering: "text-accent",
  capraise: "text-fg-mute",
};

/** Recent trades and market events, newest first. */
export function Tape({ limit = 40 }: { limit?: number }) {
  const m = useMarket();
  const rows = m.tape.slice(0, limit);

  if (rows.length === 0) return <Empty>No prints yet</Empty>;

  return (
    <ul className="divide-y divide-line/60">
      {rows.map((e) => (
        <li key={e.id} className="flex items-baseline gap-2 px-3 py-1.5 text-xs">
          <span className="num shrink-0 text-fg-mute">{fmtSimDate(e.tMs).slice(0, 6)}</span>
          {e.kind === "trade" ? (
            <>
              <span
                className={`label shrink-0 ${e.side === "BUY" ? "text-up" : "text-down"}`}
              >
                {e.side}
              </span>
              <span className="num shrink-0 text-fg-dim">{Math.round(e.qty ?? 0)}</span>
              {e.artistId ? (
                <Link href={`/artist/${e.artistId}`} className="truncate hover:text-accent">
                  {e.artistName}
                </Link>
              ) : (
                <span className="truncate">{e.artistName}</span>
              )}
              <span className="num ml-auto shrink-0 text-fg">
                {fmtCredits(e.price ?? 0)}
              </span>
              <span className="label w-14 shrink-0 truncate text-right">{e.actor}</span>
            </>
          ) : (
            <>
              <span className={`label shrink-0 ${EVENT_TONE[e.eventKind ?? ""] ?? "text-fg-mute"}`}>
                {EVENT_LABEL[e.eventKind ?? ""] ?? e.eventKind}
              </span>
              {e.artistId ? (
                <Link href={`/artist/${e.artistId}`} className="truncate text-fg-dim hover:text-accent">
                  {e.text}
                </Link>
              ) : (
                <span className="truncate text-fg-dim">{e.text}</span>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
