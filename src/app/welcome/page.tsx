import { AuthPanel } from "@/components/AuthPanel";
import { Logo, LogoMark } from "@/components/Logo";
import { STARTING_CREDITS } from "@/lib/sim/constants";
import { universeSize } from "@/lib/sim/names";
import { fmtCompact } from "@/lib/format";

export const metadata = {
  title: "xcadence — sign in",
  description: "A live simulated exchange in artist royalty shares.",
};

/**
 * The only page a signed-out visitor can reach.
 *
 * Deliberately one screen: the venue is a shared link, so the pitch and the
 * form sit together rather than making someone click through to a second page
 * before they know what they are signing into.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-12 md:grid-cols-[1fr_340px] md:gap-14 md:py-20">
      {/* ---------------------------------------------------------- pitch */}
      <div className="flex flex-col justify-center">
        <Logo size={30} showTagline />

        <h1 className="mt-7 text-2xl leading-tight text-fg md:text-[28px]">
          A live market in emerging-artist royalties,
          <br className="hidden md:block" />{" "}
          <span className="text-fg-dim">running whether or not you are watching.</span>
        </h1>

        <p className="mt-4 max-w-md text-sm leading-relaxed text-fg-dim">
          {fmtCompact(universeSize())} artists, {fmtCompact(STARTING_CREDITS)}{" "}
          credits of virtual capital, and a tick engine that keeps moving on
          simulated time. Prices come from an automated market maker that you
          and thirty-odd algorithmic traders push around together.
        </p>

        <ul className="mt-7 flex flex-col gap-3 border-t border-line pt-6">
          {[
            ["Your own book", "Separate cash, positions and equity curve. The market is shared; the capital is not."],
            ["Heavy tails, on purpose", "Most names go nowhere and a few go vertical. The median result is not the mean one."],
            ["Shown, not asserted", "Survivorship bias, adverse selection and diversification are measured off this run's own data."],
          ].map(([title, body]) => (
            <li key={title} className="flex gap-3">
              <span className="mt-[3px] shrink-0">
                <LogoMark height={11} />
              </span>
              <span className="text-xs leading-relaxed">
                <span className="text-fg">{title}.</span>{" "}
                <span className="text-fg-mute">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ----------------------------------------------------------- form */}
      <AuthPanel next={next ?? "/"} />
    </div>
  );
}
