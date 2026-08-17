# xcadence

A continuously-running simulated exchange in music royalty shares, built to
make a specific argument: that the standard toolkit for valuing an asset class
with heavy-tailed returns quietly misleads you, and that you can see it happen
if the market is real enough to watch.

The market runs on its own. Prices move whether or not anyone is looking, a
server-side clock advances simulated time at up to a month per minute, thirty-two
synthetic participants trade continuously, and the whole state survives a
restart.

**Stack** — Next.js 16 (App Router) · TypeScript · Tailwind · Recharts ·
SQLite via Prisma. No other runtime dependencies: the seeded RNG, log-normal
and Pareto sampling, LMSR market maker, Kaplan-Meier estimator with Greenwood
intervals, IRR solver and mean-variance optimiser are all implemented directly.

---

## What it does

**A market that runs itself.** A `setInterval` inside a long-lived route
handler advances simulated time at 1×, 60×, 1440× or 43200×. Every tick moves
artist fundamentals, runs synthetic order flow and accrues royalties on
schedule. State write-behinds to SQLite, so killing the server and restarting
resumes exactly where it stopped. Server-Sent Events push live quotes to the
browser.

**An AMM instead of an order book.** Each artist has a Logarithmic Market
Scoring Rule maker: `price(q) = vMax · σ(q/b)`, `C(q) = vMax · b · ln(1 + e^(q/b))`.
An order book with no resting orders quotes nothing at all, which on four
hundred thin listings means an empty screen on exactly the names the venue
exists for. LMSR always quotes both sides at a bounded, known subsidy — the
cost is that your own size moves the price, and the ticket shows you the exact
slippage before you commit.

**Heavy-tailed returns, on purpose.** Monthly log-growth is
`Δlog L = μ + κ·(log L* − log L)/12 + σ·Z + 1{breakout}·log(Pareto)`. Across a
run the mean listener count sits roughly 30× the median. Reversion is
asymmetric — 0.35 pulling up toward an artist's quality level, 2.0 pulling down
from above it — because with symmetric reversion the multiplicative jumps stack
and the top of the universe runs away past any listener count a real artist has
had.

**Hidden ground truth.** Every artist carries a `trueQuality` and a real
`hazardRate` that nothing in the normal interface can read. The bots and every
valuation see only observable fundamentals and a hazard rate inferred from
tier. That gap is the point: it is why the market can stay wrong, and why the
run inspector has something to measure.

### The quantitative work

| Tool | What it does |
|---|---|
| **DCF** | Royalty stream discounted with a decaying growth rate and a survival factor. Sensitivity sweep marks where valuation halves. |
| **Monte Carlo** | 10,000 paths, fan chart, terminal distribution binned at P99. Reports the mean−median gap explicitly. |
| **Survival** | Kaplan-Meier on recorded exits, right-censored at current age, segmented by tier at debut. |
| **Survivorship bias** | The same cohort computed twice — survivors only vs everyone who was there. |
| **Diversification** | Correlation matrix and portfolio variance against holding count, falling to a market-risk floor rather than to zero. |
| **Adverse selection** | Sliders for seller information and offer price; shows the accepting pool degrade and the market unravel. |
| **Portfolio** | Mean-variance over the live book: alpha, beta, appraisal ratio, and a risk/return scatter. |

### Findings the simulation actually produces

- **Survivorship bias overstates mean return by ~104%.** Survivors-only mean
  +57% against a full-cohort mean of −23%. Both from the same recorded run;
  exits are written with a date and never deleted.
- **Royalty offerings: 56% return less than invested**, median −51% against a
  mean of +262%, with a single 21× outcome carrying 65% of cohort value.
  Nothing is weighted to produce this — offerings are priced off a tier-average
  hazard rate while each artist's real hazard is drawn individually, so sellers
  who are worse than they look are the ones happy to sell.
- **Information is rewarded.** Fundamental bots returned +504% against momentum
  at −153% and noise at −77%.
- **The market underpays for quality it cannot see.** Hazard error is positive
  in every quality decile and shrinks monotonically with quality, from +1.3% a
  month at the bottom to +0.02% at the top.

### Why Black-Scholes is not used

Three independent reasons, any one disqualifying: there is no traded
underlying (you cannot buy a royalty stream, only claims on it — and the claim
*is* the instrument); there is no replicating portfolio (nothing here can be
hedged, and exit risk is not spanned by any tradeable asset); and returns are
not log-normal (power-law jumps plus a hazard of absorption at zero). The
methodology page covers this and the limitations of every model used instead.

---

## Running it

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```

Then <http://localhost:3000>. The engine boots with the server, seeds a
universe on first run, and starts ticking.

### Two rosters

`ROSTER_MODE` in `.env` selects what the exchange lists.

- **`real`** (default) — 253 real US rap and R&B artists, with photographs and
  biographies from Wikipedia, catalogues from MusicBrainz and sleeves from the
  Cover Art Archive. No API keys required. A background pass fills the cache in
  about nine minutes at MusicBrainz's one-request-per-second limit.
- **`demo`** — generated names, no real people, and no outbound requests at
  all. The market, the engine and every quantitative tool behave identically;
  only the names and the profile lookups change. Demo mode also restores
  continuous artist entry, which the real roster cannot have — adding a listing
  there would mean inventing a name.

Every figure in the application is simulated in both modes. In `real` mode the
biography, photograph and discography are genuine and everything else — listener
counts, royalties, prices, tier, volatility, and events such as *dropped by
label* — is output from a seeded random number generator and describes nobody.
Artist pages separate the two under their own headings.

### Deployment

```bash
docker build -t xcadence .
docker run -p 3000:3000 -v xcadence-data:/data xcadence
```

The image defaults to `ROSTER_MODE=real`. On first boot it works through the
roster at MusicBrainz's one-request-per-second limit — roughly nine minutes —
so photographs and discographies fill in progressively while the market runs
normally. The cache lives on the mounted volume, so redeploys against the same
volume start warm.

Every page carries a disclosure naming which fields are genuine and stating
that all market data is generated. Set `ROSTER_MODE=demo` if you would rather
publish generated names instead.

This will **not** run on a serverless platform. The clock is a `setInterval` in
a long-lived process and the state is a SQLite file, so it needs a container
that stays warm and a writable volume — Railway, Render, Fly.io or a VPS.
Functions that freeze between requests stop the clock; ephemeral filesystems
lose the run.

---

## Design notes

A few decisions that were not obvious, recorded because the reasoning is the
interesting part:

- **Contracts carry a per-artist `unitScale`** fixed at listing. Without it a
  superstar contract prices near 90,000 credits and a dormant one at 0.02, and
  a single account cannot trade both.
- **Bots rank opportunities on `|ln(fair/price)|`**, not `fair/price − 1`. The
  latter is unbounded above but floored at −1 below, so every overvalued artist
  sorted to the bottom of the shortlist and nothing was ever sold.
- **Bot position limits size off equity, not cash.** Sizing off cash froze the
  fundamental bots permanently once they were fully invested — including out of
  selling names they did not hold.
- **A failed flush is retried, not discarded.** The whole flush is one
  transaction, so a failure rolled back `lastMonthKey` while the world kept
  advancing; the next reload replayed months already written. World and
  database had drifted to 218 vs 393 active artists before this was caught.
- **Artists share a common factor.** Without an industry-wide shock and
  aggregate passive flow, every pairwise correlation sits at zero and the
  diversification tool shows variance falling to nothing, which is not what
  diversification does.

## Licence and attribution

Artist biographies and photographs come from Wikipedia (CC BY-SA), catalogue
data from MusicBrainz (CC0) and cover art from the Cover Art Archive. Artist
pages link back to the source for each. No affiliation with, or endorsement by,
any artist named in `real` mode is implied.

Virtual currency sandbox. Not a financial product.
