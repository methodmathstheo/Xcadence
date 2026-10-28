import { prisma } from "@/lib/db";
import { RNG } from "@/lib/rng";
import { generateNames, genreFor, GENRES, isDemo, ROSTER, universeSize } from "@/lib/sim/names";
import { anchorFor, loadFigureIndex, type FigureIndex } from "@/lib/music/listeners";
import { loadRosterCandidates } from "@/lib/music/wikipedia-roster";
import { nameKey } from "@/lib/music/name-key";
import type { Chart } from "@/lib/sim/roster-data";
import {
  advanceDays,
  applyMarketShock,
  MARKET_SHOCK_SD,
  monthBoundary,
  monthlyRoyalty,
  qualityForListeners,
  targetListeners,
  type ArtistState,
  type SimEvent,
} from "@/lib/sim/dynamics";
import { qForPrice } from "@/lib/sim/lmsr";
import {
  classifyTier,
  CONTRACT_PRICE_BAND,
  STARTING_CREDITS,
  TIER_DEPTH,
  type Tier,
} from "@/lib/sim/constants";
import { dcf, estimateInputs } from "@/lib/quant/dcf";
import { monthKey, monthKeyToMs, MS_DAY } from "@/lib/sim/time";

/** Simulated "today" when a run is created. Fixed so seeds reproduce exactly. */
export const SIM_START_MS = Date.UTC(2026, 8, 1);
export const HISTORY_MONTHS = 36;
/**
 * In real mode the universe is exactly the roster, so the venue is a closed
 * cohort: nothing debuts and exits shrink it. In demo mode names are generated,
 * which restores continuous entry and with it the survival and survivorship
 * tooling's supply of fresh cohorts.
 */
export const UNIVERSE_SIZE = universeSize();
export const BOT_COUNT = 32;

const BOT_STRATEGIES = [
  { strategy: "momentum", label: "MOM", weight: 8 },
  { strategy: "meanreversion", label: "REV", weight: 8 },
  { strategy: "fundamental", label: "FUN", weight: 8 },
  { strategy: "noise", label: "NSE", weight: 8 },
] as const;

const BOT_PREFIX = [
  "Cygnet", "Halberd", "Tessera", "Orbital", "Kestrel", "Basalt", "Novena",
  "Pallas", "Ridgeline", "Aperture", "Kelvin", "Sagitta", "Umbra", "Torrent",
  "Placid", "Verdigris", "Ashgrove", "Lodestar", "Quorum", "Nimbus", "Cadre",
  "Fathom", "Bramble", "Ostrich", "Vellum", "Zephyr", "Larkspur", "Onyx",
  "Palisade", "Tundish", "Wraith", "Yardarm",
];
const BOT_SUFFIX = ["Capital", "Partners", "Advisors", "Desk", "Systematic", "Research"];

/**
 * Hidden parameters and opening fundamentals for one artist.
 *
 * Shared by a fresh run and by late listings so the two agree exactly: the
 * same RNG fork produces the same artist either way.
 *
 * With a real monthly-listener figure (`anchor`), the artist opens at that
 * audience and its hidden quality is the level at which the dynamics hold it
 * there, so the venue's pecking order matches the public one on day one and
 * stays plausible afterwards. Without one, both are drawn as before.
 */
export function seedArtist(
  r: RNG,
  name: string,
  genre: string,
  nowMs: number,
  anchor: number | null,
): ArtistState {
  const trueQuality =
    anchor !== null
      ? Math.min(0.98, Math.max(0.05, qualityForListeners(anchor) + r.normal(0, 0.01)))
      : Math.min(0.98, Math.max(0.05, Math.pow(r.next(), 1.6) * 1.05));

  // Roughly a fifth of the old rate. These are established artists, not
  // emerging acts, and the previous calibration would have retired a quarter
  // of the roster before the run even opened.
  const hazardRate = Math.max(
    0.0002,
    0.004 * Math.exp(-3.4 * trueQuality) * r.uniform(0.7, 1.4),
  );
  const driftMu = -0.011 + 0.05 * trueQuality + r.normal(0, 0.006);
  const sigma = 0.055 + 0.2 * (1 - trueQuality) + r.uniform(0, 0.05);
  const breakoutP = 0.0025 + 0.012 * trueQuality;
  const royaltyRate = r.uniform(0.0028, 0.0062);

  const target = targetListeners({ trueQuality });
  const drawn = Math.max(150, target * Math.exp(r.normal(-0.9, 1.0)));
  const listeners = anchor !== null ? Math.max(150, anchor) : drawn;

  // Some artists debut inside the history window; the rest predate it.
  const debutMonthsAgo = r.int(2, 140);
  const debutMs = monthKeyToMs(monthKey(nowMs) - debutMonthsAgo);

  return {
    id: -1,
    name,
    genre,
    tier: classifyTier(listeners),
    debutTier: classifyTier(listeners),
    debutMs,
    active: true,
    exitMs: null,
    exitReason: null,
    trueQuality,
    hazardRate,
    driftMu,
    sigma,
    breakoutP,
    listeners,
    listeners30: listeners,
    listeners90: listeners,
    volatility: sigma * Math.sqrt(12),
    royaltyRate,
    unitScale: 10_000,
    q: 0,
    b: 1,
    vMax: 1,
    price: 0,
    prevPrice: 0,
    logReturns: [],
    listenerTrail: [listeners],
    dirty: false,
  };
}

/**
 * Open a market for an artist from its fundamentals. Fixes the contract unit
 * so the quote lands inside the price band, then opens near fair value with
 * error. `unitScale` never changes again after this — every later price move
 * is a real move, not a redenomination.
 */
export function openMarket(a: ArtistState, r: RNG): void {
  const pv = dcf(estimateInputs(a)).pv;
  // A contract is never more than the whole claim, so artists whose entire
  // royalty stream is worth less than the band floor simply list cheap.
  const openTarget = r.uniform(CONTRACT_PRICE_BAND.lo, CONTRACT_PRICE_BAND.hi);
  a.unitScale = Math.max(1, pv / openTarget);
  const price = Math.max(0.01, (pv / a.unitScale) * Math.exp(r.normal(0, 0.22)));
  const depth = TIER_DEPTH[a.tier as Tier] ?? TIER_DEPTH.emerging;
  a.b = Math.max(500, depth / price);
  a.vMax = price * 8;
  a.q = qForPrice(price, a.b, a.vMax);
  a.price = price;
  a.prevPrice = price;
}

/**
 * Scale an artist's backfilled path so it ends exactly at its anchor.
 *
 * The backfill random-walks forward from the opening figure, so after 36
 * months it lands somewhere near it rather than on it. Anchoring is a
 * statement about today, so the whole path is rescaled to meet the figure at
 * the current month; the shape of the history is kept, its level is pinned.
 */
function pinPathToAnchor(a: ArtistState, anchor: number, rows: { listeners: number; royalty: number }[]) {
  if (!(a.listeners > 0) || !(anchor > 0)) return;
  const k = anchor / a.listeners;
  if (!Number.isFinite(k) || Math.abs(k - 1) < 1e-9) return;
  a.listeners *= k;
  a.listeners30 *= k;
  a.listeners90 *= k;
  a.listenerTrail = a.listenerTrail.map((v) => v * k);
  a.tier = classifyTier(a.listeners);
  for (const row of rows) {
    row.listeners *= k;
    row.royalty *= k;
  }
}

/**
 * Build a complete run: hidden parameters, 36 months of backfilled history
 * generated by the *same* process the live engine will run forward, an opening
 * market state, synthetic participants, and the user's account.
 *
 * Exited artists are written with `active = false` and an exit date. They are
 * never deleted — every survivorship figure in the app depends on those rows
 * still being there.
 */
export async function createRun(seed: number): Promise<number> {
  const rng = new RNG(seed);
  const demo = isDemo();
  const names = demo
    ? generateNames(rng.fork("names"), UNIVERSE_SIZE)
    : (ROSTER as readonly string[]);
  const startMonth = monthKey(SIM_START_MS) - HISTORY_MONTHS;
  const figures: FigureIndex | null = demo ? null : await loadFigureIndex();

  // ---------------------------------------------------------------- artists
  const states: ArtistState[] = [];
  const anchors: (number | null)[] = [];
  for (let i = 0; i < UNIVERSE_SIZE; i++) {
    const r = rng.fork("artist", i);
    const genre = demo ? r.pick(GENRES) : genreFor(names[i]);
    const anchor = figures ? anchorFor(figures, names[i], r.fork("anchor")) : null;
    const a = seedArtist(r, names[i], genre, SIM_START_MS, anchor);
    a.id = i; // temporary; replaced with the DB id after insert
    states.push(a);
    anchors.push(anchor);
  }

  // ------------------------------------------------- 36 months of history
  type MonthRow = { i: number; monthKey: number; dateMs: number; listeners: number; royalty: number; rank: number };
  const monthRows: MonthRow[] = [];
  const histEvents: (SimEvent & { tMs: number })[] = [];

  for (let m = 0; m < HISTORY_MONTHS; m++) {
    const mk = startMonth + m;
    const tMs = monthKeyToMs(mk);
    // Same common factor the live engine applies, so backfilled history has
    // the same cross-sectional correlation structure as forward-generated data.
    const marketShock = rng.fork("hist-market", mk).normal(0, MARKET_SHOCK_SD);

    for (let i = 0; i < states.length; i++) {
      const a = states[i];
      if (!a.active) continue;
      if (a.debutMs > tMs) continue; // not yet releasing
      const r = rng.fork("hist", i, mk);
      applyMarketShock(a, marketShock);
      advanceDays(a, r, 30);
      for (const e of monthBoundary(a, r, tMs)) histEvents.push({ ...e, tMs });
      monthRows.push({
        i,
        monthKey: mk,
        dateMs: tMs,
        listeners: a.listeners,
        royalty: monthlyRoyalty(a),
        rank: 0,
      });
    }
  }

  // Anchored artists meet their real figure today; then every month is ranked.
  if (!demo) {
    const rowsOf = new Map<number, MonthRow[]>();
    for (const row of monthRows) {
      const arr = rowsOf.get(row.i) ?? [];
      arr.push(row);
      rowsOf.set(row.i, arr);
    }
    states.forEach((a, i) => {
      const anchor = anchors[i];
      if (anchor !== null && a.active) pinPathToAnchor(a, anchor, rowsOf.get(i) ?? []);
    });
  }
  rankMonths(monthRows);

  // --------------------------------------------------- opening market state
  for (const a of states) {
    openMarket(a, rng.fork("px", a.name));
  }

  // -------------------------------------------------------------- persist
  const run = await prisma.run.create({
    data: {
      seed,
      simMs: SIM_START_MS,
      startMs: SIM_START_MS,
      speed: 1440,
      running: true,
      tick: 0,
      lastMonthKey: monthKey(SIM_START_MS),
      active: true,
    },
  });

  await prisma.artist.createMany({
    data: states.map((a, i) => artistRow(run.id, a, anchors[i] !== null)),
  });

  const created = await prisma.artist.findMany({
    where: { runId: run.id },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const idOf = (i: number) => created[i].id;
  states.forEach((a, i) => (a.id = idOf(i)));

  await chunked(monthRows, 2000, (batch) =>
    prisma.artistMonth.createMany({
      data: batch.map((r) => ({
        artistId: idOf(r.i),
        monthKey: r.monthKey,
        dateMs: r.dateMs,
        listeners: r.listeners,
        royalty: r.royalty,
        rank: r.rank,
      })),
    }),
  );

  await chunked(histEvents, 2000, (batch) =>
    prisma.marketEvent.createMany({
      data: batch.map((e) => ({
        runId: run.id,
        artistId: e.artistId === null ? null : idOf(e.artistId),
        kind: e.kind,
        magnitude: e.magnitude,
        headline: e.headline,
        tMs: e.tMs,
      })),
    }),
  );

  await prisma.pricePoint.createMany({
    data: states.map((a) => ({ artistId: a.id, tMs: SIM_START_MS, price: a.price })),
  });

  // ------------------------------------------------------------------ bots
  const botRng = rng.fork("bots");
  await prisma.bot.createMany({
    data: Array.from({ length: BOT_COUNT }, (_, i) => {
      const s = BOT_STRATEGIES[i % BOT_STRATEGIES.length];
      const startCash = botRng.uniform(6_000_000, 55_000_000);
      return {
        runId: run.id,
        name: `${BOT_PREFIX[i % BOT_PREFIX.length]} ${botRng.pick(BOT_SUFFIX)}`,
        strategy: s.strategy,
        // Sized to represent the professional side of the venue as a whole,
        // not 32 retail accounts. At ~1M each they collectively could not shift
        // 400 markets whose LMSR depth is 0.4-3M credits apiece, and quotes
        // drifted steadily further from fundamentals instead of converging.
        cash: startCash,
        startCash,
        aggression: botRng.uniform(0.35, 1.4),
        horizon: botRng.int(3, 40),
      };
    }),
  });

  // Accounts are no longer seeded here. Each trader gets one — funded with
  // STARTING_CREDITS — the first time they open the venue under this run, so a
  // run that nobody has visited yet has no books at all.

  // -------------------------------------------------------- index baseline
  const activeStates = states.filter((a) => a.active);
  const equalRaw = mean(activeStates.map((a) => a.price));
  const totalListeners = activeStates.reduce((s, a) => s + a.listeners, 0);
  const weightedRaw =
    activeStates.reduce((s, a) => s + a.price * a.listeners, 0) / Math.max(1, totalListeners);

  await prisma.run.update({
    where: { id: run.id },
    data: {
      indexBaseEqual: equalRaw / 100,
      indexBaseWeighted: weightedRaw / 100,
    },
  });
  await prisma.indexPoint.create({
    data: { runId: run.id, tMs: SIM_START_MS, equal: 100, weighted: 100 },
  });
  // ----------------------------------------------------- opening offerings
  const offerRng = rng.fork("offerings");
  const candidates = states.filter((a) => a.active && (a.tier === "emerging" || a.tier === "dormant"));
  for (let i = 0; i < 9 && candidates.length > 0; i++) {
    const a = candidates[offerRng.int(0, candidates.length - 1)];
    await prisma.offering.create({
      data: buildOffering(a, offerRng, SIM_START_MS, run.id),
    });
  }

  return run.id;
}

/**
 * Price an offering off the *naive* valuation — the one built from the market's
 * tier-based hazard estimate rather than the artist's real hazard. Sellers who
 * know they are worse than they look are therefore systematically happy to sell.
 */
export function buildOffering(
  a: ArtistState,
  rng: RNG,
  tMs: number,
  runId: number,
) {
  const pctRoyalty = rng.uniform(0.02, 0.12);
  const termMonths = rng.pick([36, 60, 84]);
  const est = estimateInputs(a);
  const naive = dcf({
    ...est,
    monthlyRoyalty: est.monthlyRoyalty * pctRoyalty,
    horizonMonths: termMonths,
  }).pv;
  const askCredits = Math.max(250, naive * rng.uniform(0.8, 1.25));
  return {
    runId,
    artistId: a.id,
    pctRoyalty,
    askCredits,
    termMonths,
    openMs: tMs,
    expiresMs: tMs + rng.int(20, 75) * MS_DAY,
    status: "OPEN",
    filled: 0,
  };
}

/** Rank every month's rows by listeners, 1 = most. Rows are mutated in place. */
function rankMonths(rows: { monthKey: number; listeners: number; rank: number }[]): void {
  const byMonth = new Map<number, typeof rows>();
  for (const r of rows) {
    const arr = byMonth.get(r.monthKey) ?? [];
    arr.push(r);
    byMonth.set(r.monthKey, arr);
  }
  for (const arr of byMonth.values()) {
    arr.sort((x, y) => y.listeners - x.listeners);
    arr.forEach((r, idx) => (r.rank = idx + 1));
  }
}

async function chunked<T>(rows: T[], size: number, fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) {
    await fn(rows.slice(i, i + size));
  }
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/**
 * List any roster artist the active run does not have yet.
 *
 * The roster grows over time, and a reseed is the only other way to pick up
 * new names — which wipes every account, trade and position on the venue.
 * Instead, missing names are admitted into the live run on boot: generated by
 * the same seeded process as a fresh run (keyed on the artist's roster index,
 * so a later reseed produces the same parameters), with 36 months of history
 * backfilled up to the run's current month so their charts and valuations
 * have data from day one.
 *
 * Idempotent: an artist already in the run is never touched, so this is a
 * no-op on every boot after the first. Real mode only — demo names are
 * generated per run and have no fixed roster to sync against.
 */
export async function syncRoster(runId: number): Promise<ArtistState[]> {
  if (isDemo()) return [];
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) return [];

  const existingRows = await prisma.artist.findMany({ where: { runId }, select: { name: true } });
  const existing = new Set(existingRows.map((a) => a.name));
  const existingKeys = new Set(existingRows.map((a) => nameKey(a.name)));
  const figures = await loadFigureIndex();

  type Missing = {
    name: string;
    /** What the artist's RNG stream is keyed on, so a reseed reproduces it. */
    seed: (string | number)[];
    chart: Chart | null;
    wikiTitle: string | null;
    country: string | null;
  };
  const missing: Missing[] = [];

  // The hand-written roster lists unconditionally, keyed by index as before.
  (ROSTER as readonly string[]).forEach((name, index) => {
    if (existing.has(name)) return;
    missing.push({ name, seed: [index], chart: null, wikiTitle: null, country: null });
    existingKeys.add(nameKey(name));
  });

  // Discovered candidates list only when a public audience figure exists:
  // that figure is what "established" means here. Without a complete
  // snapshot there is nothing to judge by, so they wait for the next boot.
  if (figures.populated) {
    for (const c of await loadRosterCandidates()) {
      if (existingKeys.has(c.key)) continue;
      if (figures.get(c.name) === null) continue;
      existingKeys.add(c.key);
      missing.push({
        name: c.name,
        seed: ["wiki", c.key],
        chart: c.chart,
        wikiTitle: c.wikiTitle !== c.name ? c.wikiTitle : null,
        country: c.country ?? null,
      });
    }
  }
  if (missing.length === 0) return [];

  const rng = new RNG(run.seed);
  const nowMk = run.lastMonthKey;
  const nowMs = monthKeyToMs(nowMk);
  const firstMk = nowMk - HISTORY_MONTHS + 1;

  type Row = { i: number; monthKey: number; dateMs: number; listeners: number; royalty: number; rank: number };
  const states: ArtistState[] = [];
  const anchors: (number | null)[] = [];
  const monthRows: Row[] = [];

  for (const m of missing) {
    const { name } = m;
    const r = rng.fork("artist", ...m.seed);
    const anchor = anchorFor(figures, name, r.fork("anchor"));
    anchors.push(anchor);
    const a = seedArtist(r, name, genreFor(name, m.chart ?? undefined), nowMs, anchor);
    const i = states.length;
    a.id = i;
    const own: Row[] = [];

    // Backfill. Same common market factor per month as a fresh run, so the
    // late listings share the venue's cross-sectional correlation.
    for (let mk = firstMk; mk <= nowMk; mk++) {
      const tMs = monthKeyToMs(mk);
      if (a.debutMs > tMs) continue;
      const hr = rng.fork("late-hist", ...m.seed, mk);
      applyMarketShock(a, rng.fork("hist-market", mk).normal(0, MARKET_SHOCK_SD));
      advanceDays(a, hr, 30);
      monthBoundary(a, hr, tMs);
      // A listing that "exited" before anyone could trade it would arrive dead
      // on the board. The backfill is context, not a verdict: keep it listed.
      a.active = true;
      a.exitMs = null;
      a.exitReason = null;
      own.push({ i, monthKey: mk, dateMs: tMs, listeners: a.listeners, royalty: monthlyRoyalty(a), rank: 0 });
    }
    if (anchor !== null) pinPathToAnchor(a, anchor, own);
    a.tier = classifyTier(a.listeners);
    openMarket(a, rng.fork("px", name));
    states.push(a);
    monthRows.push(...own);
  }

  const before = await prisma.artist.count({ where: { runId } });
  await prisma.artist.createMany({
    data: states.map((a, i) => ({
      ...artistRow(runId, a, anchors[i] !== null),
      chart: missing[i].chart,
      wikiTitle: missing[i].wikiTitle,
      country: missing[i].country,
    })),
  });
  const created = await prisma.artist.findMany({
    where: { runId },
    orderBy: { id: "asc" },
    skip: before,
    select: { id: true, name: true },
  });
  const idByName = new Map<string, number>(
    created.map((c: { id: number; name: string }) => [c.name, c.id] as [string, number]),
  );
  states.forEach((a) => (a.id = idByName.get(a.name)!));

  // Rank each backfilled month against everyone already listed that month.
  const others = await prisma.artistMonth.findMany({
    where: { artist: { runId }, monthKey: { gte: firstMk, lte: nowMk } },
    select: { monthKey: true, listeners: true },
  });
  const byMonth = new Map<number, number[]>();
  for (const o of others as { monthKey: number; listeners: number }[]) {
    const arr = byMonth.get(o.monthKey) ?? [];
    arr.push(o.listeners);
    byMonth.set(o.monthKey, arr);
  }
  for (const r of monthRows) {
    const arr = byMonth.get(r.monthKey) ?? [];
    arr.push(r.listeners);
    byMonth.set(r.monthKey, arr);
  }
  for (const arr of byMonth.values()) arr.sort((x, y) => y - x);
  const rankIn = (mk: number, listeners: number) => {
    const arr = byMonth.get(mk) ?? [];
    // First index whose value is not greater: binary search on the sorted list.
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] > listeners) lo = mid + 1; else hi = mid;
    }
    return lo + 1;
  };

  await chunked(monthRows, 2000, (batch) =>
    prisma.artistMonth.createMany({
      data: batch.map((r) => ({
        artistId: states[r.i].id,
        monthKey: r.monthKey,
        dateMs: r.dateMs,
        listeners: r.listeners,
        royalty: r.royalty,
        rank: rankIn(r.monthKey, r.listeners),
      })),
    }),
  );
  await chunked(states, 2000, (batch) =>
    prisma.pricePoint.createMany({
      data: batch.map((a) => ({ artistId: a.id, tMs: run.simMs, price: a.price })),
    }),
  );

  const discovered = missing.filter((m) => m.chart !== null).length;
  console.log(`[roster] listed ${states.length} new artists into run ${runId} (${discovered} discovered, ${states.length - discovered} hand-written)`);
  return states;
}

/** The persisted shape of an artist, for createMany. */
function artistRow(runId: number, a: ArtistState, anchored: boolean) {
  return {
    runId,
    name: a.name,
    genre: a.genre,
    tier: a.tier,
    debutTier: a.debutTier,
    debutMs: a.debutMs,
    active: a.active,
    exitMs: a.exitMs,
    exitReason: a.exitReason,
    trueQuality: a.trueQuality,
    hazardRate: a.hazardRate,
    driftMu: a.driftMu,
    sigma: a.sigma,
    breakoutP: a.breakoutP,
    listeners: a.listeners,
    listeners30: a.listeners30,
    listeners90: a.listeners90,
    volatility: a.volatility,
    royaltyRate: a.royaltyRate,
    unitScale: a.unitScale,
    q: a.q,
    b: a.b,
    vMax: a.vMax,
    price: a.price,
    prevPrice: a.prevPrice,
    anchoredAt: anchored ? Date.now() : null,
  };
}

/**
 * Re-anchor the artists already in a run to their real monthly-listener
 * figures, once.
 *
 * Before anchoring, every listener count on the venue was drawn by the
 * generator, so the board's pecking order was fiction. Listing new artists at
 * their real size against incumbents at invented sizes would make the ranking
 * meaningless, so the incumbents move too — but without moving any price.
 *
 * Listeners, the stored history and the hidden parameters are rescaled to the
 * real figure; `unitScale` is rescaled by the same change in the royalty
 * claim's value, so each contract is worth what it was a moment earlier and
 * every open position, bot book and quote is undisturbed. The royalty a
 * contract pays moves only by the ratio of listeners to claim value, which is
 * close to one. Artists with no public figure are left exactly as they were.
 *
 * Marked by `anchoredAt`, so it is a no-op on every boot after the first.
 */
export async function anchorRun(runId: number): Promise<number> {
  if (isDemo()) return 0;
  const rows = await prisma.artist.findMany({ where: { runId, anchoredAt: null } });
  const artists: ArtistState[] = rows.map((a) => ({
    id: a.id,
    name: a.name,
    genre: a.genre,
    tier: a.tier as Tier,
    debutTier: a.debutTier as Tier,
    debutMs: a.debutMs,
    active: a.active,
    exitMs: a.exitMs,
    exitReason: a.exitReason,
    trueQuality: a.trueQuality,
    hazardRate: a.hazardRate,
    driftMu: a.driftMu,
    sigma: a.sigma,
    breakoutP: a.breakoutP,
    listeners: a.listeners,
    listeners30: a.listeners30,
    listeners90: a.listeners90,
    volatility: a.volatility,
    royaltyRate: a.royaltyRate,
    unitScale: a.unitScale,
    q: a.q,
    b: a.b,
    vMax: a.vMax,
    price: a.price,
    prevPrice: a.prevPrice,
    logReturns: [],
    listenerTrail: [],
    dirty: false,
  }));
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run || artists.length === 0) return 0;
  const figures = await loadFigureIndex();
  if (!figures.populated) {
    console.warn(`[anchor] no listener snapshot yet; ${artists.length} artists left unanchored until one is fetched`);
    return 0;
  }

  const rng = new RNG(run.seed).fork("anchor");
  type Change = {
    id: number; k: number; listeners: number; listeners30: number; listeners90: number;
    tier: string; trueQuality: number; hazardRate: number; driftMu: number; breakoutP: number;
    unitScale: number;
  };
  const changes: Change[] = [];
  const untouched: number[] = [];

  for (const a of artists) {
    const r = rng.fork(a.name);
    const anchor = anchorFor(figures, a.name, r.fork("anchor"));
    if (anchor === null || !a.active || !(a.listeners > 0)) {
      untouched.push(a.id);
      continue;
    }
    const k = anchor / a.listeners;
    const next: ArtistState = {
      ...a,
      listeners: a.listeners * k,
      listeners30: a.listeners30 * k,
      listeners90: a.listeners90 * k,
    };
    next.tier = classifyTier(next.listeners);
    next.trueQuality = Math.min(0.98, Math.max(0.05, qualityForListeners(anchor) + r.normal(0, 0.01)));
    next.hazardRate = Math.max(0.0002, 0.004 * Math.exp(-3.4 * next.trueQuality) * r.uniform(0.7, 1.4));
    next.driftMu = -0.011 + 0.05 * next.trueQuality + r.normal(0, 0.006);
    next.breakoutP = 0.0025 + 0.012 * next.trueQuality;

    // Same claim value per contract as before, so the quote stands.
    const pvBefore = dcf(estimateInputs(a)).pv;
    const pvAfter = dcf(estimateInputs(next)).pv;
    const ratio = pvBefore > 0 && Number.isFinite(pvAfter / pvBefore) ? pvAfter / pvBefore : k;
    next.unitScale = Math.max(1, a.unitScale * ratio);

    changes.push({
      id: a.id, k,
      listeners: next.listeners, listeners30: next.listeners30, listeners90: next.listeners90,
      tier: next.tier, trueQuality: next.trueQuality, hazardRate: next.hazardRate,
      driftMu: next.driftMu, breakoutP: next.breakoutP, unitScale: next.unitScale,
    });
  }

  const now = Date.now();
  await prisma.$transaction(async (tx) => {
    for (const batch of chunk(changes, 400)) {
      const values = batch
        .map((c) => `(${c.id},${n(c.listeners)},${n(c.listeners30)},${n(c.listeners90)},'${c.tier}',${n(c.trueQuality)},${n(c.hazardRate)},${n(c.driftMu)},${n(c.breakoutP)},${n(c.unitScale)})`)
        .join(",");
      await tx.$executeRawUnsafe(
        `UPDATE "Artist" SET listeners = v.column2, listeners30 = v.column3, listeners90 = v.column4, ` +
        `tier = v.column5, trueQuality = v.column6, hazardRate = v.column7, driftMu = v.column8, ` +
        `breakoutP = v.column9, unitScale = v.column10, anchoredAt = ${now} ` +
        `FROM (VALUES ${values}) AS v WHERE "Artist".id = v.column1`,
      );
      // Stored history keeps its shape and moves to the new level with it.
      const scales = batch.map((c) => `(${c.id},${n(c.k)})`).join(",");
      await tx.$executeRawUnsafe(
        `UPDATE "ArtistMonth" SET listeners = listeners * v.column2, royalty = royalty * v.column2 ` +
        `FROM (VALUES ${scales}) AS v WHERE "ArtistMonth".artistId = v.column1`,
      );
    }
    for (const batch of chunk(untouched, 500)) {
      await tx.artist.updateMany({ where: { id: { in: batch } }, data: { anchoredAt: now } });
    }
  }, { timeout: 120_000 });

  // Month ranks are relative, so every month in the window is re-ranked.
  const monthRows = await prisma.artistMonth.findMany({
    where: { artist: { runId } },
    select: { id: true, monthKey: true, listeners: true, rank: true },
  });
  const ranked = monthRows.map((r) => ({ id: r.id, monthKey: r.monthKey, listeners: r.listeners, rank: r.rank, old: r.rank }));
  rankMonths(ranked);
  const moved = ranked.filter((r) => r.rank !== r.old);
  await prisma.$transaction(async (tx) => {
    for (const batch of chunk(moved, 1000)) {
      const values = batch.map((r) => `(${r.id},${r.rank})`).join(",");
      await tx.$executeRawUnsafe(
        `UPDATE "ArtistMonth" SET rank = v.column2 FROM (VALUES ${values}) AS v WHERE "ArtistMonth".id = v.column1`,
      );
    }
  }, { timeout: 120_000 });

  console.log(`[anchor] re-anchored ${changes.length} artists in run ${runId} (${untouched.length} inactive left as they were; ${moved.length} month ranks moved)`);
  return changes.length;
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** A finite number as a SQL literal; anything else becomes 0. */
function n(x: number): string {
  return Number.isFinite(x) ? String(x) : "0";
}
