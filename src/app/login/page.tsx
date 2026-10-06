import Link from "next/link";
import type { Metadata } from "next";
import { AuthPanel } from "@/components/AuthPanel";
import { Logo } from "@/components/Logo";
import { TickerStrip } from "@/components/landing/TickerStrip";
import { STARTING_CREDITS } from "@/lib/sim/constants";
import { universeSize } from "@/lib/sim/names";
import { fmtCompact } from "@/lib/format";
import { landingRoster } from "@/lib/landing/roster";

export const metadata: Metadata = {
  title: "xcadence — sign in",
  description: "Open a book on the xcadence royalties exchange.",
};

/**
 * The step between the front door and the venue.
 *
 * One column, centred, nothing to read but the form — whatever persuading was
 * needed happened on the landing page, and repeating it here would just put
 * another paragraph between someone and their account.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string }>;
}) {
  const [{ mode, next }, { board }] = await Promise.all([searchParams, landingRoster()]);

  return (
    <div className="flex min-h-[72vh] flex-col">
      <div className="flex flex-1 items-center justify-center px-5 py-14">
        <div className="w-full max-w-[360px]">
          <Link href="/" className="flex justify-center">
            <Logo size={20} showTagline />
          </Link>

          <p className="mt-7 text-center text-[13px] leading-relaxed text-fg-dim">
            {fmtCompact(STARTING_CREDITS)} virtual credits and {universeSize()} listings,
            on a market that is already running.
          </p>

          <div className="mt-7">
            <AuthPanel
              next={next ?? "/markets"}
              initialMode={mode === "signin" ? "signin" : "register"}
            />
          </div>

          <Link
            href="/"
            className="label mt-6 block text-center text-[9px] transition-colors hover:text-fg-dim"
          >
            ← Back to overview
          </Link>
        </div>
      </div>

      <TickerStrip board={board} speed={90} />
    </div>
  );
}
