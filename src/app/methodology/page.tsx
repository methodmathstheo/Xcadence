import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Methodology — Cadence",
};

/**
 * Written for someone who will check the reasoning rather than take it on
 * trust. Where a model is wrong or a number is not what it appears to be, this
 * page says so plainly instead of qualifying it away.
 */
export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-[13px] leading-relaxed text-fg-dim">
      <h1 className="mb-1 text-xl text-fg">Methodology</h1>
      <p className="label mb-8">What this simulates, what it does not, and where each model breaks</p>

      <Section title="What the data is">
        <p>
          <Strong>Every number in this application is generated.</Strong> Listener counts, growth
          rates, royalty figures, prices, and the hidden quality and hazard parameters behind them
          are all output from a seeded random number generator. No external data source is read,
          and no real catalogue, chart, contract or streaming service is represented.
        </p>
        <p>
          <Strong>The names are a mix.</Strong> The top hundred listings carry the names of real US
          rap and R&amp;B artists; every other listing, and every artist that debuts during a run,
          is invented from word lists. The real names are labels and nothing more — no figure
          attached to them was measured, estimated or derived from anything that person has
          actually done, and their position in the roster is not a ranking.
        </p>
        <p>
          <Strong>Photographs and discographies come from Spotify, or from nowhere.</Strong> When
          Spotify credentials are configured, roster artists show their real profile photo,
          follower and popularity figures, and their real release list, fetched from the Spotify
          Web API and cached. Generated artists get a monogram and a release history invented
          alongside the rest of them. No real artist is ever given a fabricated catalogue: an
          invented album title attached to a real person reads as a factual claim, and nothing in
          this simulation is entitled to make one. Without credentials the roster simply shows no
          discography.
        </p>
        <p>
          Nothing fetched from Spotify feeds the market. Prices, listeners, royalties, growth,
          hazard and every hidden parameter are simulated. The follower and popularity numbers are
          displayed on the artist page and used nowhere else — no valuation, no bot, and no
          ranking reads them.
        </p>
        <p>
          This matters most where the simulation is unflattering. The engine assigns every listing
          a hidden probability of ceasing to be commercially active, and generates events like{" "}
          <em>dropped by label</em>, <em>faded out</em> and <em>no longer commercially active</em>.
          When one of those lands on a real name it is a draw from a random number generator,
          carries no information about that person, and should not be read as one. Real names are
          assigned to the highest-quality artists in the universe specifically so this is the
          uncommon case, but the same process applies to every listing and nothing is exempt.
        </p>
        <p>
          A run is fully determined by its seed. The same seed rebuilds the same universe, the same
          36 months of history and the same forward path — every stochastic decision draws from a
          stream derived from <Code>(seed, label, index)</Code>, so the order in which artists are
          processed never changes the numbers any one of them gets.
        </p>
      </Section>

      <Section title="The artist process">
        <p>Monthly log-growth in listeners is</p>
        <Pre>{`Δ log L  =  μ  +  κ·(log L* − log L)/12  +  σ·Z  +  1{breakout}·log(Pareto)`}</Pre>
        <p>
          <Code>L*</Code> is the listener level the artist&apos;s hidden quality supports.{" "}
          <Code>κ</Code> is asymmetric — 0.35 pulling up toward that level, 2.0 pulling down from
          above it. That asymmetry is not decoration: with symmetric reversion the multiplicative
          breakout jumps stack and the top of the universe runs away to listener counts no real
          artist has ever had.
        </p>
        <p>
          The Pareto term is what makes the cross-section heavy-tailed. Across a run the mean
          listener count sits roughly 30× the median. Returns here are emphatically not normal, and
          any tool that assumes they are will be wrong in a specific direction: it will understate
          how often nothing happens and how much rides on the few cases where something does.
        </p>
        <p>
          Each artist also carries a monthly hazard of ceasing to be commercially active. Exits are
          recorded with a date and the row is kept. Nothing is ever deleted, because every
          survivorship figure in the lab depends on those rows still being there.
        </p>
        <p>
          One industry-wide shock is drawn per simulated month and applied to every listed artist,
          alongside aggregate passive flow through the market maker. Without a common factor the
          artists here would be statistically independent, pairwise correlation would sit at zero,
          and the diversification tool would show portfolio variance falling to nothing — which is
          not what diversification does.
        </p>
      </Section>

      <Section title="Why Black-Scholes is not used">
        <p>
          The obvious move for anything called a contract is to reach for an option-pricing model.
          It does not apply here, for three separate reasons, any one of which would be enough.
        </p>
        <p>
          <Strong>There is no traded underlying.</Strong> Black-Scholes prices a derivative by
          reference to an asset you can buy and hold. The underlying here is an artist&apos;s future
          royalty stream. You cannot buy the stream itself, only claims on it, and the claim{" "}
          <em>is</em> the instrument being priced. There is no spot price to plug in.
        </p>
        <p>
          <Strong>There is no replicating portfolio.</Strong> The derivation depends on being able
          to hedge continuously in the underlying, so that the option&apos;s payoff can be
          reproduced by a self-financing trading strategy and no-arbitrage pins the price. Nothing
          here can be hedged: you cannot short an artist&apos;s streaming numbers, there is no
          liquid correlated instrument, and the exit risk — the artist simply stopping — is not
          spanned by any tradeable asset. Without replication the argument does not just lose
          precision, it loses its justification entirely.
        </p>
        <p>
          <Strong>Returns are not log-normal.</Strong> Black-Scholes assumes geometric Brownian
          motion: continuous paths, constant volatility, log-normal terminal distribution. This
          process has a power-law jump component, a hazard of absorption at zero, and volatility
          that varies by artist and over time. The tail that matters most is exactly the part the
          model represents worst.
        </p>
        <p>
          What is used instead: discounted cash flow for a point estimate, Monte Carlo over the
          actual generating process for the distribution, and Kaplan-Meier for survival. None of
          these need a replicating portfolio. The Monte Carlo is doing the job an option model
          would be misused for.
        </p>
      </Section>

      <Section title="Discounted cash flow — and its limits">
        <p>
          Projected monthly royalties, growing at a rate that decays by half every 30 months,
          multiplied by the probability the artist is still active, discounted at an annual rate.
        </p>
        <Pre>{`CF_m = R₀ · Π(1 + g_k) · (1 − h)^m
PV   = Σ CF_m / (1 + r)^(m/12)`}</Pre>
        <p>
          <Strong>The hazard rate matters more than the discount rate.</Strong> Most of the present
          value arrives in the first two years, so moving the discount rate between 5% and 30%
          changes the answer far less than moving <Code>h</Code> does. The sensitivity chart marks
          where value halves; on most artists that point is well inside the plausible range for{" "}
          <Code>h</Code> and well outside it for <Code>r</Code>.
        </p>
        <p>
          <Strong>The hazard rate used is a tier average.</Strong> Every artist in a tier is
          assigned the same monthly exit probability, while the simulation draws a real rate per
          artist. This is deliberate, and it is the single largest source of error in every
          valuation in this application. The run inspector shows the gap directly.
        </p>
        <p>
          <Strong>Growth is extrapolated from a 90-day window.</Strong> That is a very short base
          for a projection running ten years. The estimate is shrunk toward a tier prior, weighted
          by realised volatility, and hard-bounded to between −50% and +120% a year. An earlier
          version compounded the observed quarterly move to the fourth power unbounded, which
          produced valuations that moved by multiples month to month — not a number any analyst
          would publish, and not an anchor any market could track.
        </p>
        <p>
          <Strong>A single DCF figure says nothing about dispersion.</Strong> It lands near the mean
          of the distribution, and on this distribution the mean is not a typical outcome.
        </p>
      </Section>

      <Section title="Monte Carlo — and its limits">
        <p>
          10,000 paths of the monthly process against a constant hazard, discounted. Reported as
          mean, median, P10, P90 and probability of near-total loss, with the mean-median gap
          called out explicitly because that gap is the point.
        </p>
        <p>
          <Strong>It inherits every input error from the DCF.</Strong> Running ten thousand paths
          off a wrong hazard rate produces a precise distribution around a wrong centre. The width
          of the fan is informative; its location is only as good as the parameters.
        </p>
        <p>
          <Strong>Volatility and hazard are held constant along each path.</Strong> In the engine
          both move — hazard rises after a label drop, falls after a breakout. The Monte Carlo does
          not model that feedback, so it understates how much outcomes cluster.
        </p>
        <p>
          <Strong>The jump distribution is capped.</Strong> Pareto draws are limited to 9× to keep
          the universe physically plausible. The cap binds on well under 1% of draws, but it does
          mean the extreme right tail is thinner than the stated distribution implies.
        </p>
      </Section>

      <Section title="Survival analysis — and its limits">
        <p>
          Kaplan-Meier over recorded exits, segmented by the tier an artist debuted in. Artists
          still listed are right-censored at their present age rather than counted as survivors: a
          debut from three months ago carries no information about five-year survival.
        </p>
        <p>
          <Strong>Segmenting on debut tier, not current tier,</Strong> because current tier is
          partly an outcome. Grouping by where an artist ended up conditions on survival and
          flattens every curve toward optimism.
        </p>
        <p>
          <Strong>Confidence intervals are Greenwood, and they are wide at long horizons</Strong>{" "}
          where few artists have been observed that long. A curve that has not reached a horizon
          reports a dash rather than extrapolating.
        </p>
        <p>
          <Strong>The hazard is not constant in reality</Strong> even inside this simulation — it is
          modulated by recent trajectory. Kaplan-Meier does not assume a constant hazard, but the
          DCF that consumes these numbers does.
        </p>
      </Section>

      <Section title="Survivorship bias">
        <p>
          The comparison in the lab takes every artist listed at some past month, buys one contract
          of each, and holds to now. An artist that has since exited is worth zero. The same
          statistic is then computed twice: over the names still listed, and over everyone who was
          there at the start.
        </p>
        <p>
          The first figure is what naive analysis produces, because the natural way to study this
          market is to pull today&apos;s listings and look at their history. Every name on that list
          shares one property that has nothing to do with skill: it is still there. On a typical
          run the survivors-only mean overstates the full-cohort mean by around 100%, and the
          error grows with both the horizon and the hazard rate of the tier.
        </p>
        <p>
          <Strong>It is not a constant you can subtract off.</Strong> That is the practical point.
          A correction factor fitted on one horizon will be wrong at another.
        </p>
      </Section>

      <Section title="Diversification">
        <p>
          Correlation is computed on winsorised monthly log returns from month-close prices.
          Winsorisation at ±1.2 in log space keeps a single repricing event from dominating an
          entire matrix; log rather than simple returns because a contract here can genuinely move
          by an order of magnitude in a month.
        </p>
        <p>
          The variance curve uses the closed form for an equally weighted book —{" "}
          <Code>v/k + (1 − 1/k)·ρ·v</Code> — rather than resampling actual portfolios. That is
          exact for equal weights and average correlation, and it makes the floor explicit, but it
          assumes every name has the same variance, which they do not.
        </p>
        <p>
          <Strong>What diversification does not fix:</Strong> on a right-skewed distribution,
          spreading capital evenly raises the chance you hold the name that carries the cohort and
          lowers how much it matters when you do. The median diversified portfolio still
          underperforms the mean. Reducing variance and improving the typical outcome are not the
          same objective here.
        </p>
      </Section>

      <Section title="The market mechanism">
        <p>
          Each artist has a logarithmic market scoring rule maker rather than an order book. Price
          comes from the net contracts the market holds:
        </p>
        <Pre>{`price(q) = vMax · σ(q / b)
C(q)     = vMax · b · ln(1 + e^(q/b))`}</Pre>
        <p>
          An order book with no resting orders quotes nothing at all, which on four hundred mostly
          thin listings would mean an empty screen on precisely the emerging names this venue
          exists for. LMSR always quotes both sides at a bounded, known subsidy. What it costs is
          the ability to trade without impact: your own size moves the price, and the slippage
          figure on the ticket is you paying for that.
        </p>
        <p>
          Contracts carry a per-artist <Code>unitScale</Code> fixed at listing, so every market
          opens in one price band. Without it a superstar contract would cost around 90,000 credits
          and a dormant one 0.02, and a single account could not trade both. It never changes
          afterwards, so every later price move is a real move rather than a redenomination.
        </p>
        <p>
          Between 20 and 40 synthetic participants trade continuously on momentum, mean reversion,
          DCF divergence and noise. <Strong>None of them can see the hidden parameters.</Strong>{" "}
          They price off the same observable fundamentals and tier-based hazard estimate available
          on any artist page, which is why the market can stay wrong and why the run inspector has
          something to measure.
        </p>
      </Section>

      <Section title="What this does not represent">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            Real royalty economics. Actual payouts depend on contracts, splits, advances,
            recoupment, publishing versus master rights and territory — none of which is modelled.
            One royalty rate per artist stands in for all of it.
          </li>
          <li>
            Real market microstructure. There is no order book, no spread, no queue, no latency,
            no market impact beyond the AMM curve, and no counterparty risk.
          </li>
          <li>
            Real listener dynamics. Playlists, release schedules, touring, catalogue and social
            platforms are compressed into a drift term and four kinds of shock.
          </li>
          <li>
            Any investable product. Credits are virtual, there is no settlement, and the prices
            here are the output of a random number generator with a documented seed.
          </li>
          <li>
            Anything about the real people whose names appear on the roster. Their careers,
            earnings, audiences, contracts and prospects are not modelled, not referenced, and not
            knowable from anything on this screen.
          </li>
        </ul>
      </Section>

      <Section title="Known limitations of the implementation">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            Intra-month price detail lives in an in-memory ring buffer and is not durable. After a
            restart, live charts rebuild from month closes; only the shape between closes is lost.
          </li>
          <li>
            The trailing 30/90-day listener marks are persisted but the daily series behind them is
            not, so those two figures are reconstructed by interpolation on reload.
          </li>
          <li>
            Monthly fundamentals are pruned beyond 180 months and the trade table beyond 20,000
            rows. Long fast-forward runs discard old detail; artist debut and exit dates, which
            every survival figure depends on, are never pruned.
          </li>
          <li>
            Projected total return on an offering is a straight-line extrapolation of the current
            run rate. It ignores both growth and the hazard of the artist stopping, so it is
            optimistic by construction and labelled as a projection wherever it appears.
          </li>
          <li>
            Aggregate passive flow moves the market maker&apos;s inventory directly rather than
            through an attributed participant, because it is not one participant&apos;s decision.
            It therefore appears in prices but not in the trade blotter.
          </li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 border-b border-line pb-1 text-sm text-fg">{title}</h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="num overflow-x-auto border border-line bg-panel px-3 py-2 text-xs text-fg">
      {children}
    </pre>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <span className="num text-fg">{children}</span>;
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-fg">{children}</strong>;
}
