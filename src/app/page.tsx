import Link from "next/link";
import type { Metadata } from "next";
import { Logo, LogoMark } from "@/components/Logo";
import { Reveal } from "@/components/landing/Reveal";
import { MockTerminal } from "@/components/landing/MockTerminal";
import { TickerStrip } from "@/components/landing/TickerStrip";
import {
  MockClock, MockEquity, MockOffering, MockRankings, MockSurvival,
} from "@/components/landing/panels";
import { currentUser } from "@/lib/auth/session";
import { BOT_COUNT, HISTORY_MONTHS } from "@/lib/sim/universe";
import { STARTING_CREDITS } from "@/lib/sim/constants";
import { universeSize } from "@/lib/sim/names";
import { fmtCompact, fmtInt } from "@/lib/format";

export const metadata: Metadata = {
  title: "xcadence — the exchange for emerging music",
  description:
    "A continuously-running simulated exchange in artist royalty shares. Virtual currency, real market microstructure.",
};

/**
 * The public front door.
 *
 * Everything here is reachable without an account and talks to nothing: the
 * panels are seeded illustrations rather than live engine reads. That is
 * deliberate on two counts — a shopfront should not wait on a tick loop to
 * boot, and the listings shown are symbols rather than the real artists the
 * venue lists behind the login.
 *
 * The pacing is borrowed openly: one idea per screen, set in large type with
 * a working panel beside it, and nothing explained twice.
 */
export default async function HomePage() {
  const user = await currentUser();

  return (
    <div className="flex flex-col">
      {/* ================================================================ hero */}
      <section className="relative overflow-hidden px-5 pb-16 pt-14 sm:pt-20">
        <div className="mx-auto max-w-[1080px]">
          <Reveal className="flex flex-col items-center text-center">
            <Logo size={19} showTagline />

            <p className="label mt-8 text-accent">Simulated venue · Virtual currency</p>

            <h1 className="mt-3 max-w-[18ch] text-[34px] font-semibold leading-[1.06] tracking-[-0.03em] text-fg sm:max-w-[20ch] sm:text-6xl sm:leading-[1.04] lg:text-7xl">
              The exchange for{" "}
              <br className="hidden sm:inline" />
              what happens next{" "}
              <br className="hidden sm:inline" />
              <span className="text-accent">in music.</span>
            </h1>

            <p className="mt-6 max-w-[54ch] text-[15px] leading-relaxed text-fg-dim sm:text-base">
              Buy and sell royalty shares in {universeSize()} artists against a live
              automated market maker. The clock never stops, {BOT_COUNT} algorithmic
              traders push the quotes around with you, and every credit is virtual.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              {user ? (
                <>
                  <Cta href="/markets">Enter the exchange</Cta>
                  <Ghost href="/portfolio">Your portfolio</Ghost>
                </>
              ) : (
                <>
                  <Cta href="/login?mode=register">Open an account</Cta>
                  <Ghost href="/login">Sign in</Ghost>
                </>
              )}
            </div>

            <p className="label mt-5 text-[9px]">
              Free · No payment details · Nothing to withdraw
            </p>
          </Reveal>

          <Reveal delay={120} className="mt-14 sm:mt-16">
            <MockTerminal />
          </Reveal>
        </div>
      </section>

      <TickerStrip />

      {/* ============================================================== scale */}
      <section className="px-5 py-14">
        <Reveal className="mx-auto grid max-w-[1080px] grid-cols-2 gap-px bg-line md:grid-cols-4">
          {[
            [fmtInt(universeSize()), "artists listed"],
            [`${HISTORY_MONTHS} months`, "of seeded history"],
            [fmtInt(BOT_COUNT), "algorithmic traders"],
            [fmtCompact(STARTING_CREDITS), "opening credits"],
          ].map(([figure, label]) => (
            <div key={label} className="bg-ink px-4 py-5 text-center">
              <div className="num text-xl text-fg sm:text-2xl">{figure}</div>
              <div className="label mt-1 text-[9px]">{label}</div>
            </div>
          ))}
        </Reveal>
      </section>

      {/* =========================================================== pricing */}
      <section className="border-y border-line bg-panel/30 px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-[1080px]">
          <Reveal>
            <h2 className="max-w-[26ch] text-3xl font-semibold leading-tight tracking-[-0.025em] text-fg sm:text-[40px]">
              There is no queue to jump.
            </h2>
            <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-fg-dim">
              Every market is a logarithmic market scoring rule. Liquidity is always
              there, the price is a closed-form function of net position, and your
              slippage is quoted exactly before you commit — not estimated.
            </p>
          </Reveal>

          <Reveal delay={100} className="mt-10 grid gap-px bg-line sm:grid-cols-3">
            {[
              [
                "Priced, not matched",
                "price = vMax · σ(q ⁄ b). Depth comes from the cost curve, so a thin name is thin for a reason you can read off the ladder.",
              ],
              [
                "Impact you can see",
                "The ticket shows fill price, average price and the mark it leaves behind, before the trade. Size into a small market and you will watch it cost you.",
              ],
              [
                "Fundamentals underneath",
                "Listener counts compound on a heavy-tailed process with a hidden hazard rate. Most names fade. A few go vertical.",
              ],
            ].map(([title, body]) => (
              <div key={title} className="bg-ink p-5">
                <LogoMark height={11} />
                <h3 className="mt-3.5 text-[15px] text-fg">{title}</h3>
                <p className="num mt-2 text-[11px] leading-relaxed text-fg-mute">{body}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ========================================================== features */}
      <Feature
        eyebrow="The board"
        title="Every listing, ranked."
        body="One table, ordered by whatever you care about — monthly listeners, biggest growth, price high to low, rap or R&B. Every name is a link through to that artist's biography, catalogue and full market history."
        visual={<MockRankings />}
      />

      <Feature
        flip
        eyebrow="Your book"
        title="Separate capital, shared market."
        body="Everyone who signs in gets their own cash, positions and equity curve. The market is shared — two people trading the same name move each other's marks — but the book is yours. Mean-variance analytics sit on top: beta against the index, idiosyncratic volatility, appraisal ratio, concentration against a limit."
        visual={<MockEquity />}
      />

      <Feature
        eyebrow="The primary market"
        title="Artists sell a slice of the future."
        body="An emerging artist raises credits against a share of future royalties, and the engine pays that share month by simulated month along whatever path the artist actually takes. Offerings are priced off the market's tier-based hazard estimate while the real hazard is drawn per artist — so sellers who are worse than they look are systematically happy to sell."
        visual={<MockOffering />}
      />

      <Feature
        flip
        eyebrow="The lab"
        title="Shown, not asserted."
        body="Survivorship bias, adverse selection and the limits of diversification, measured off this run's own data rather than described. Kaplan-Meier survival with confidence intervals and right-censoring, segmented on where an artist debuted. Monte Carlo over ten thousand paths. A discounted cash flow you can push the discount rate through."
        visual={<MockSurvival />}
      />

      {/* =========================================================== the clock */}
      <section className="border-y border-line bg-panel/30 px-5 py-16 sm:py-20">
        <div className="mx-auto grid max-w-[1080px] items-center gap-10 md:grid-cols-[1fr_300px]">
          <Reveal>
            <p className="label text-accent">The clock</p>
            <h2 className="mt-3 max-w-[22ch] text-3xl font-semibold leading-tight tracking-[-0.025em] text-fg sm:text-[40px]">
              Run a decade before lunch.
            </h2>
            <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-fg-dim">
              The venue runs on its own clock, in a long-lived server process rather
              than a page. Leave it at real time, or wind it to a month a minute and
              watch careers resolve. Jump forward, pause, or reset the whole universe
              back to its seed and get the identical run again.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <MockClock />
          </Reveal>
        </div>
      </section>

      {/* ============================================================== close */}
      <section className="px-5 py-20 sm:py-28">
        <Reveal className="mx-auto flex max-w-[640px] flex-col items-center text-center">
          <LogoMark height={22} />
          <h2 className="mt-6 text-3xl font-semibold leading-tight tracking-[-0.025em] text-fg sm:text-[40px]">
            {user ? "The market is open." : "Open a book in a minute."}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-fg-dim">
            {fmtCompact(STARTING_CREDITS)} virtual credits, {universeSize()} listings
            and a market that has been running since before you got here.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {user ? (
              <Cta href="/markets">Enter the exchange</Cta>
            ) : (
              <>
                <Cta href="/login?mode=register">Open an account</Cta>
                <Ghost href="/login">Sign in</Ghost>
              </>
            )}
          </div>

          <p className="num mt-10 max-w-[60ch] text-[10px] leading-relaxed text-fg-mute">
            Panels on this page are illustrations driven by a seeded generator, and the
            symbols shown are placeholders. The venue itself lists real artists, with
            biographies and catalogues from Wikipedia and MusicBrainz; every price,
            listener count and royalty figure in it is simulated.
          </p>
        </Reveal>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

/**
 * One idea per screen: heading and prose on one side, a working panel on the
 * other, alternating down the page.
 */
function Feature({
  eyebrow,
  title,
  body,
  visual,
  flip = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <section className="px-5 py-16 sm:py-20">
      <div className="mx-auto grid max-w-[1080px] items-center gap-10 md:grid-cols-2 md:gap-14">
        <Reveal className={flip ? "md:order-2" : undefined}>
          <p className="label text-accent">{eyebrow}</p>
          <h2 className="mt-3 max-w-[20ch] text-3xl font-semibold leading-tight tracking-[-0.025em] text-fg sm:text-[40px]">
            {title}
          </h2>
          <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-fg-dim">{body}</p>
        </Reveal>
        <Reveal delay={120} className={flip ? "md:order-1" : undefined}>
          {visual}
        </Reveal>
      </div>
    </section>
  );
}

function Cta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full bg-accent px-6 py-2.5 text-[13px] font-semibold text-ink transition-opacity hover:opacity-90"
    >
      {children}
    </Link>
  );
}

function Ghost({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full border border-line-2 px-6 py-2.5 text-[13px] text-fg-dim transition-colors hover:border-accent hover:text-fg"
    >
      {children}
    </Link>
  );
}
