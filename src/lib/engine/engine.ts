import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { RNG } from "@/lib/rng";
import {
  advanceDays,
  monthBoundary,
  monthlyRoyalty,
  type ArtistState,
} from "@/lib/sim/dynamics";
import { ensureHeadroom, lmsrPrice } from "@/lib/sim/lmsr";
import { monthKey, monthKeyToMs, MS_DAY, SPEEDS } from "@/lib/sim/time";
import type { Tier } from "@/lib/sim/constants";
import { getOrCreateRun, resetRun } from "@/lib/sim/run";
import { runOrderFlow } from "@/lib/engine/bots";
import { spawnArtists } from "@/lib/engine/entry";
import { accrueRoyalties, refreshOfferings } from "@/lib/engine/offerings";
import { pushEvent, pushTape } from "@/lib/engine/tape";
import type { PendingWrites, StreamFrame, World } from "@/lib/engine/types";

/** Wall-clock period of one tick. Simulated time advances by this × speed. */
export const TICK_MS = 1000;
/** Ticks between write-behind flushes to SQLite. */
const FLUSH_EVERY = 5;
/** Live price samples retained per artist, in memory only. */
const RING = 720;
/** Months of fundamentals kept on disk; older rows are pruned at rollover. */
const MONTH_RETENTION = 180;
/** Trades kept on disk. The tape is a feed, not an audit log. */
const TRADE_RETENTION = 20_000;

type Subscriber = (frame: StreamFrame) => void;

class Engine {
  world: World | null = null;
  private timer: NodeJS.Timeout | null = null;
  private subscribers = new Set<Subscriber>();
  private loading: Promise<World> | null = null;
  private flushing = false;
  /** Set while a control action owns the world; the wall clock stands off. */
  private suspended = false;

  // ------------------------------------------------------------ lifecycle

  async ensureLoaded(): Promise<World> {
    if (this.world) return this.world;
    if (this.loading) return this.loading;
    this.loading = this.load();
    try {
      return await this.loading;
    } finally {
      this.loading = null;
    }
  }

  private async load(): Promise<World> {
    const run = await getOrCreateRun();
    const [artists, bots, account, positions] = await Promise.all([
      prisma.artist.findMany({ where: { runId: run.id } }),
      prisma.bot.findMany({ where: { runId: run.id }, include: { positions: true } }),
      prisma.account.findUniqueOrThrow({ where: { runId: run.id } }),
      prisma.position.findMany({ where: { runId: run.id } }),
    ]);

    const map = new Map<number, ArtistState>();
    for (const a of artists) {
      map.set(a.id, {
        id: a.id,
        name: a.name,
        genre: a.genre,
        tier: a.tier as Tier,
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
        // The daily trail is not persisted. Rebuild a monotone ramp through the
        // stored 90/30/current marks so growth columns stay correct after a
        // restart; only the shape between marks is approximate.
        listenerTrail: rebuildTrail(a.listeners90, a.listeners30, a.listeners),
        dirty: false,
      });
    }

    // Restore realised monthly vol from stored history.
    const recentMonths = await prisma.artistMonth.findMany({
      where: { artist: { runId: run.id }, monthKey: { gt: run.lastMonthKey - 25 } },
      orderBy: { monthKey: "asc" },
      select: { artistId: true, listeners: true },
    });
    const byArtist = new Map<number, number[]>();
    for (const r of recentMonths) {
      const arr = byArtist.get(r.artistId) ?? [];
      arr.push(r.listeners);
      byArtist.set(r.artistId, arr);
    }
    for (const [id, series] of byArtist) {
      const a = map.get(id);
      if (!a) continue;
      for (let i = 1; i < series.length; i++) {
        a.logReturns.push(Math.log(Math.max(series[i], 1) / Math.max(series[i - 1], 1)));
      }
      if (a.logReturns.length > 24) a.logReturns = a.logReturns.slice(-24);
    }

    const world: World = {
      runId: run.id,
      seed: run.seed,
      rng: new RNG(run.seed),
      simMs: run.simMs,
      startMs: run.startMs,
      speed: run.speed,
      running: run.running,
      tick: run.tick,
      lastMonthKey: run.lastMonthKey,
      indexBaseEqual: run.indexBaseEqual,
      indexBaseWeighted: run.indexBaseWeighted,
      index: { equal: 100, weighted: 100 },
      artists: map,
      order: artists.map((a) => a.id),
      bots: bots.map((b) => ({
        id: b.id,
        name: b.name,
        strategy: b.strategy,
        cash: b.cash,
        aggression: b.aggression,
        horizon: b.horizon,
        positions: new Map(
          b.positions.map((p) => [p.artistId, { qty: p.qty, costBasis: p.costBasis }]),
        ),
      })),
      account: {
        cash: account.cash,
        startingCash: account.startingCash,
        realisedPnl: account.realisedPnl,
        sessionStartEquity: account.sessionStartEquity,
      },
      positions: new Map(
        positions.map((p) => [
          p.artistId,
          { qty: p.qty, costBasis: p.costBasis, realised: p.realised },
        ]),
      ),
      priceRing: new Map(),
      tape: [],
      dirty: new Set(),
      pending: emptyPending(),
      changed: new Set(),
    };

    for (const a of map.values()) {
      world.priceRing.set(a.id, [{ t: world.simMs, p: a.price }]);
    }
    recomputeIndex(world);
    await seedTape(world);

    this.world = world;
    return world;
  }

  /** Boot: load state and start the wall clock. Idempotent. */
  async boot() {
    await this.ensureLoaded();
    this.startTimer();
    this.installShutdownHooks();
  }

  private hooksInstalled = false;

  /** Last write-behind on the way out, so a restart resumes where it stopped. */
  private installShutdownHooks() {
    if (this.hooksInstalled) return;
    this.hooksInstalled = true;
    const shutdown = async () => {
      try {
        await this.flush();
      } finally {
        process.exit(0);
      }
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }

  private startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.onTick();
    }, TICK_MS);
    // Never hold the process open on this alone.
    this.timer.unref?.();
  }

  private async onTick() {
    if (this.suspended) return;
    const w = this.world ?? (await this.ensureLoaded().catch(() => null));
    if (this.suspended || !w || !w.running) return;
    try {
      this.step(w, TICK_MS * w.speed);
      this.emit(w);
      if (w.tick % FLUSH_EVERY === 0) await this.flush();
    } catch (err) {
      console.error("[engine] tick failed", err);
    }
  }

  // ---------------------------------------------------------------- clock

  /**
   * Advance simulated time by `deltaMs`, stopping at every month boundary so
   * discrete monthly machinery runs exactly once per simulated month no matter
   * how large the step. A single tick at 43200× spans half a simulated day; a
   * jump-forward can span years.
   */
  step(w: World, deltaMs: number) {
    const target = w.simMs + deltaMs;
    let guard = 0;
    while (w.simMs < target && guard++ < 5000) {
      const nextMonth = monthKeyToMs(monthKey(w.simMs) + 1);
      const stop = Math.min(target, nextMonth);
      const span = stop - w.simMs;

      if (span > 0) {
        const days = span / MS_DAY;
        const r = w.rng.fork("adv", w.tick, guard);
        for (const id of w.order) {
          const a = w.artists.get(id)!;
          if (!a.active) continue;
          const before = a.listeners;
          advanceDays(a, r.fork(id), days);
          if (Math.abs(a.listeners / before - 1) > 1e-4) {
            w.dirty.add(id);
            // Listener counts are live values in the rankings table, so a
            // fundamentals move has to reach the client even if the quote
            // stands still.
            w.changed.add(id);
          }
        }
        w.simMs = stop;
      }

      if (w.simMs >= nextMonth) {
        this.monthRollover(w, nextMonth);
      }
    }

    w.tick += 1;
    runOrderFlow(w, w.rng.fork("flow", w.tick));

    // Prices only exist where q exists — refresh quotes and sample the ring.
    for (const id of w.order) {
      const a = w.artists.get(id)!;
      const headroom = ensureHeadroom(a.q, a.b, a.vMax);
      if (headroom.raised) {
        a.q = headroom.q;
        a.vMax = headroom.vMax;
        pushEvent(w, {
          artistId: a.id,
          kind: "capraise",
          magnitude: 1,
          headline: `${a.name} — contract cap raised, quote unchanged`,
        });
      }
      const p = lmsrPrice(a.q, a.b, a.vMax);
      if (Math.abs(p - a.price) > 1e-9) {
        a.prevPrice = a.price;
        a.price = p;
        w.dirty.add(id);
        w.changed.add(id);
        const ring = w.priceRing.get(id)!;
        ring.push({ t: w.simMs, p });
        if (ring.length > RING) ring.shift();
      }
    }

    recomputeIndex(w);
  }

  private monthRollover(w: World, tMs: number) {
    const mk = monthKey(tMs);
    // A month is closed exactly once. Cheap insurance against any path that
    // could replay one — a reload mid-jump, a control action racing the clock.
    if (mk <= w.lastMonthKey) return;
    const r = w.rng.fork("month", mk);

    const live: { id: number; listeners: number }[] = [];
    for (const id of w.order) {
      const a = w.artists.get(id)!;
      if (!a.active || a.debutMs > tMs) continue;
      for (const e of monthBoundary(a, r.fork(id), tMs)) pushEvent(w, e);
      w.dirty.add(id);
      live.push({ id, listeners: a.listeners });
    }

    live.sort((x, y) => y.listeners - x.listeners);
    live.forEach((entry, idx) => {
      const a = w.artists.get(entry.id)!;
      w.pending.months.push({
        artistId: a.id,
        monthKey: mk,
        dateMs: tMs,
        listeners: a.listeners,
        royalty: monthlyRoyalty(a),
        rank: idx + 1,
      });
    });

    accrueRoyalties(w, mk, tMs);
    refreshOfferings(w, r.fork("offer"), tMs);
    spawnArtists(w, r.fork("entry"), tMs);

    // Flow runs weekly, independently of the tick loop. Otherwise a jump
    // forward advances years of fundamentals while the market trades a handful
    // of times, and the venue reopens with every quote stale — one round per
    // month was not enough for repricing to keep up with the drift.
    for (let week = 0; week < 4; week++) {
      runOrderFlow(w, r.fork("weekflow", week));
    }

    w.lastMonthKey = mk;
    w.pending.indexPoints.push({
      tMs,
      equal: w.index.equal,
      weighted: w.index.weighted,
    });
    for (const id of w.order) {
      const a = w.artists.get(id)!;
      w.pending.pricePoints.push({ artistId: id, tMs, price: a.price });
    }
  }

  // ---------------------------------------------------------- persistence

  async flush() {
    const w = this.world;
    if (!w || this.flushing) return;
    this.flushing = true;
    const dirty = [...w.dirty];
    const pending = w.pending;
    w.dirty = new Set();
    w.pending = emptyPending();

    try {
      const equity = portfolioValue(w);
      pending.equityPoints.push({
        tMs: w.simMs,
        equity: equity.equity,
        cash: w.account.cash,
        marketValue: equity.marketValue,
        realised: w.account.realisedPnl,
      });

      await prisma.$transaction(async (tx) => {
        await tx.run.update({
          where: { id: w.runId },
          data: {
            simMs: w.simMs,
            speed: w.speed,
            running: w.running,
            tick: w.tick,
            lastMonthKey: w.lastMonthKey,
          },
        });

        for (const id of dirty) {
          const a = w.artists.get(id);
          if (!a) continue;
          await tx.artist.update({
            where: { id },
            data: {
              tier: a.tier,
              active: a.active,
              exitMs: a.exitMs,
              exitReason: a.exitReason,
              hazardRate: a.hazardRate,
              driftMu: a.driftMu,
              listeners: a.listeners,
              listeners30: a.listeners30,
              listeners90: a.listeners90,
              volatility: a.volatility,
              q: a.q,
              vMax: a.vMax,
              price: a.price,
              prevPrice: a.prevPrice,
            },
          });
        }

        await tx.account.update({
          where: { runId: w.runId },
          data: { cash: w.account.cash, realisedPnl: w.account.realisedPnl },
        });

        for (const [artistId, p] of w.positions) {
          await tx.position.upsert({
            where: { runId_artistId: { runId: w.runId, artistId } },
            create: {
              runId: w.runId,
              artistId,
              qty: p.qty,
              costBasis: p.costBasis,
              realised: p.realised,
            },
            update: { qty: p.qty, costBasis: p.costBasis, realised: p.realised },
          });
        }

        for (const b of w.bots) {
          await tx.bot.update({ where: { id: b.id }, data: { cash: b.cash } });
          for (const [artistId, p] of b.positions) {
            await tx.botPosition.upsert({
              where: { botId_artistId: { botId: b.id, artistId } },
              create: { botId: b.id, artistId, qty: p.qty, costBasis: p.costBasis },
              update: { qty: p.qty, costBasis: p.costBasis },
            });
          }
        }

        if (pending.trades.length)
          await tx.trade.createMany({
            data: pending.trades.map((t) => ({ ...t, runId: w.runId })),
          });
        if (pending.events.length)
          await tx.marketEvent.createMany({
            data: pending.events.map((e) => ({ ...e, runId: w.runId })),
          });
        if (pending.pricePoints.length)
          await tx.pricePoint.createMany({ data: pending.pricePoints });
        if (pending.months.length) await insertMonths(tx, pending.months);
        if (pending.indexPoints.length)
          await tx.indexPoint.createMany({
            data: pending.indexPoints.map((p) => ({ ...p, runId: w.runId })),
          });
        if (pending.equityPoints.length)
          await tx.equityPoint.createMany({
            data: pending.equityPoints.map((p) => ({ ...p, runId: w.runId })),
          });
        if (pending.royaltyPayments.length)
          await tx.royaltyPayment.createMany({ data: pending.royaltyPayments });
      });

      if (pending.newArtists.length) await this.admitEntrants(w, pending.newArtists);
      if (pending.months.length) await this.prune(w);
    } catch (err) {
      console.error("[engine] flush failed", err);

      // Put the work back. The whole flush is one transaction, so a failure
      // rolls back run.lastMonthKey while the world keeps advancing — and the
      // next reload then replays months that were already written. Discarding
      // the batch here is what let the world and the database drift apart
      // permanently instead of retrying.
      for (const id of dirty) w.dirty.add(id);
      mergePending(w.pending, pending);

      // If the run disappeared underneath us the world is orphaned and every
      // further write would fail the same way. Drop it and reload on next tick.
      const stillThere = await prisma.run
        .findUnique({ where: { id: w.runId }, select: { id: true } })
        .catch(() => null);
      if (!stillThere) this.world = null;
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Insert this month's debuts and splice them into the live world. Done after
   * the transaction because an artist is not tradeable until it has the
   * database id every position, trade and price point will reference.
   */
  private async admitEntrants(w: World, drafts: Omit<ArtistState, "id">[]) {
    const before = await prisma.artist.count({ where: { runId: w.runId } });
    await prisma.artist.createMany({
      data: drafts.map((a) => ({
        runId: w.runId,
        name: a.name,
        genre: a.genre,
        tier: a.tier,
        debutMs: a.debutMs,
        active: true,
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
      })),
    });

    const created = await prisma.artist.findMany({
      where: { runId: w.runId },
      orderBy: { id: "asc" },
      skip: before,
      select: { id: true, name: true },
    });

    const byName = new Map(created.map((c) => [c.name, c.id]));
    for (const draft of drafts) {
      const id = byName.get(draft.name);
      if (id === undefined) continue;
      const state: ArtistState = { ...draft, id };
      w.artists.set(id, state);
      w.order.push(id);
      w.priceRing.set(id, [{ t: w.simMs, p: state.price }]);
      pushTape(w, {
        id: `debut-${id}`,
        kind: "event",
        tMs: state.debutMs,
        artistId: id,
        artistName: state.name,
        text: `${state.name} — debut listing, ${state.genre}`,
        eventKind: "debut",
        magnitude: 0,
      });
    }
  }

  /** Long fast-forward runs are unbounded in rows; keep the tables finite. */
  private async prune(w: World) {
    await prisma.artistMonth.deleteMany({
      where: {
        artist: { runId: w.runId },
        monthKey: { lt: w.lastMonthKey - MONTH_RETENTION },
      },
    });
    const count = await prisma.trade.count({ where: { runId: w.runId } });
    if (count > TRADE_RETENTION * 1.25) {
      const cutoff = await prisma.trade.findMany({
        where: { runId: w.runId },
        orderBy: { id: "desc" },
        skip: TRADE_RETENTION,
        take: 1,
        select: { id: true },
      });
      if (cutoff[0]) {
        await prisma.trade.deleteMany({
          where: { runId: w.runId, id: { lte: cutoff[0].id } },
        });
      }
    }
  }

  // -------------------------------------------------------------- controls

  async setRunning(running: boolean) {
    const w = await this.ensureLoaded();
    w.running = running;
    await this.flush();
    return w;
  }

  async setSpeed(speed: number) {
    const w = await this.ensureLoaded();
    w.speed = SPEEDS.includes(speed as (typeof SPEEDS)[number]) ? speed : 1440;
    await this.flush();
    return w;
  }

  /** Jump forward by a fixed span of simulated time, running every month. */
  async jump(days: number) {
    const w = await this.ensureLoaded();
    this.suspended = true;
    try {
      const span = Math.max(0, Math.min(days, 3650)) * MS_DAY;
      this.step(w, span);
      this.emit(w);
      await this.flush();
    } finally {
      this.suspended = false;
    }
    return w;
  }

  async reset(seed: number) {
    // The clock must not tick against a world that is being replaced: it would
    // reload a half-deleted run and replay months into the fresh universe.
    this.suspended = true;
    try {
      this.world = null;
      await resetRun(seed);
      const w = await this.ensureLoaded();
      this.emit(w);
      return w;
    } finally {
      this.suspended = false;
    }
  }

  // ---------------------------------------------------------------- stream

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  frame(w: World, full = false): StreamFrame {
    const ids = full ? w.order : [...w.changed];
    const equity = portfolioValue(w);
    return {
      simMs: w.simMs,
      tick: w.tick,
      speed: w.speed,
      running: w.running,
      wallMs: Date.now(),
      index: w.index,
      prices: ids.map((id) => {
        const a = w.artists.get(id)!;
        return [id, a.price, a.prevPrice, a.listeners] as [number, number, number, number];
      }),
      tape: w.tape.slice(0, 40),
      account: {
        cash: w.account.cash,
        equity: equity.equity,
        marketValue: equity.marketValue,
        realisedPnl: w.account.realisedPnl,
        unrealisedPnl: equity.unrealised,
        sessionPnl: equity.equity - w.account.sessionStartEquity,
      },
    };
  }

  private emit(w: World) {
    if (this.subscribers.size === 0) {
      w.changed.clear();
      return;
    }
    const f = this.frame(w);
    for (const fn of this.subscribers) {
      try {
        fn(f);
      } catch {
        /* a dead subscriber must not stop the clock */
      }
    }
    w.changed.clear();
  }
}

// ---------------------------------------------------------------- helpers

export function portfolioValue(w: World) {
  let marketValue = 0;
  let cost = 0;
  for (const [artistId, p] of w.positions) {
    if (p.qty === 0) continue;
    const a = w.artists.get(artistId);
    if (!a) continue;
    marketValue += p.qty * a.price;
    cost += p.costBasis;
  }
  return {
    marketValue,
    cost,
    unrealised: marketValue - cost,
    equity: w.account.cash + marketValue,
  };
}

export function recomputeIndex(w: World) {
  let sum = 0;
  let n = 0;
  let wSum = 0;
  let lSum = 0;
  for (const id of w.order) {
    const a = w.artists.get(id)!;
    if (!a.active) continue;
    sum += a.price;
    n++;
    wSum += a.price * a.listeners;
    lSum += a.listeners;
  }
  const equalRaw = n ? sum / n : 0;
  const weightedRaw = lSum ? wSum / lSum : 0;
  w.index = {
    equal: equalRaw / w.indexBaseEqual,
    weighted: weightedRaw / w.indexBaseWeighted,
  };
}

/**
 * Month rows, written INSERT OR IGNORE.
 *
 * A simulated month is closed exactly once in memory, but a failed flush can
 * leave the durable lastMonthKey behind the world's, and the replay that
 * follows a reload collides on (artistId, monthKey). Prisma's createMany has
 * no skipDuplicates on SQLite, so the idempotency goes in the statement.
 */
async function insertMonths(
  tx: Pick<PrismaClient, "$executeRawUnsafe">,
  rows: PendingWrites["months"],
) {
  const CHUNK = 400; // 6 bound parameters per row, well inside SQLite's limit
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const placeholders = batch.map(() => "(?,?,?,?,?,?)").join(",");
    const values = batch.flatMap((r) => [
      r.artistId, r.monthKey, r.dateMs, r.listeners, r.royalty, r.rank,
    ]);
    await tx.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "ArtistMonth"
         ("artistId","monthKey","dateMs","listeners","royalty","rank")
       VALUES ${placeholders}`,
      ...values,
    );
  }
}

/** Fold a failed flush's batch back into the live queue for the next attempt. */
function mergePending(into: PendingWrites, failed: PendingWrites) {
  into.trades.unshift(...failed.trades);
  into.events.unshift(...failed.events);
  into.pricePoints.unshift(...failed.pricePoints);
  into.months.unshift(...failed.months);
  into.indexPoints.unshift(...failed.indexPoints);
  into.equityPoints.unshift(...failed.equityPoints);
  into.royaltyPayments.unshift(...failed.royaltyPayments);
  into.newArtists.unshift(...failed.newArtists);
}

function emptyPending(): PendingWrites {
  return {
    trades: [],
    events: [],
    pricePoints: [],
    months: [],
    indexPoints: [],
    equityPoints: [],
    royaltyPayments: [],
    newArtists: [],
  };
}

/** Monotone-ish ramp through the three persisted listener marks. */
function rebuildTrail(l90: number, l30: number, now: number): number[] {
  const trail: number[] = [];
  for (let i = 0; i < 120; i++) {
    if (i < 30) trail.push(l90);
    else if (i < 90) {
      const t = (i - 30) / 60;
      trail.push(l90 * (1 - t) + l30 * t);
    } else {
      const t = (i - 90) / 30;
      trail.push(l30 * (1 - t) + now * t);
    }
  }
  return trail;
}

async function seedTape(w: World) {
  const events = await prisma.marketEvent.findMany({
    where: { runId: w.runId },
    orderBy: { id: "desc" },
    take: 60,
    include: { artist: { select: { name: true } } },
  });
  for (const e of events.reverse()) {
    pushTape(w, {
      id: `db-e${e.id}`,
      kind: "event",
      tMs: e.tMs,
      artistId: e.artistId,
      artistName: e.artist?.name ?? "—",
      text: e.headline,
      eventKind: e.kind,
      magnitude: e.magnitude,
    });
  }
}

// A module-level singleton, pinned to globalThis so Next's dev-mode module
// reloading cannot start a second clock against the same database.
const g = globalThis as unknown as { __cadenceEngine?: Engine };
export const engine = (g.__cadenceEngine ??= new Engine());
export type { Engine };
