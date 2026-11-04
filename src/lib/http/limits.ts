import { NextResponse } from "next/server";

/**
 * Request guards for the API: who is calling, how often, and how much they
 * are sending.
 *
 * The limiter is in-process. That is the right shape here rather than a
 * shortcut: the venue is one long-lived Node process by design, because the
 * market clock lives in it, so there is exactly one copy of these counters
 * and nothing to share across instances. Buckets are swept so the map cannot
 * grow without bound, and hard-capped so a flood from many addresses cannot
 * turn the limiter itself into the memory problem.
 */

/** Refill `capacity` tokens every `perMs`; a request spends one. */
export type Limit = { capacity: number; perMs: number };

export const LIMITS = {
  /** Password guesses from one address. Ten, then one a minute: a person mistyping is fine. */
  signin: { capacity: 10, perMs: 10 * 60_000 },
  /**
   * Password guesses at one account, from anywhere. Twenty, then one every
   * 45 seconds: spreading guesses across addresses buys nothing, and a
   * stranger hammering someone's address slows that person down rather than
   * locking them out.
   */
  signinAccount: { capacity: 20, perMs: 15 * 60_000 },
  /** New accounts from one address. */
  register: { capacity: 5, perMs: 60 * 60_000 },
  /** Guest accounts from one address: each costs a scrypt and a row. */
  guest: { capacity: 5, perMs: 60 * 60_000 },
  /** Guest accounts from everywhere: a botnet still cannot fill the disk. */
  guestGlobal: { capacity: 300, perMs: 60 * 60_000 },
  /** Shared clock controls: a jump is real work for every market. */
  clock: { capacity: 20, perMs: 60_000 },
  /** Orders, per account. */
  trade: { capacity: 120, perMs: 60_000 },
  /** Lab tools: Monte Carlo and cohort maths. */
  lab: { capacity: 30, perMs: 60_000 },
  /** Offering purchases, per account. */
  offerings: { capacity: 30, perMs: 60_000 },
  /** Profile reads can trigger an outbound lookup on a cache miss. */
  profile: { capacity: 120, perMs: 60_000 },
  /** Everything under /api from one address, as a backstop. */
  api: { capacity: 600, perMs: 60_000 },
} as const satisfies Record<string, Limit>;

type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();
const SWEEP_EVERY_MS = 60_000;
const IDLE_MS = 15 * 60_000;
const MAX_BUCKETS = 100_000;

/**
 * The address the request came from.
 *
 * Railway's edge sets X-Real-IP from the connection it accepted, so that is
 * the one header trusted here. X-Forwarded-For is only consulted when it is
 * absent (a local run behind some other proxy), and then only its last hop,
 * the one appended by the nearest proxy; a client can prepend to that header
 * but cannot append to it.
 */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const last = fwd.split(",").pop()?.trim();
    if (last) return last;
  }
  return "unknown";
}

/** Spend a token from the bucket for `key`. */
export function take(key: string, limit: Limit): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  sweep(now);
  const rate = limit.capacity / limit.perMs;
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: limit.capacity, updated: now };
    buckets.set(key, b);
  }
  b.tokens = Math.min(limit.capacity, b.tokens + (now - b.updated) * rate);
  b.updated = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { ok: true, retryAfterMs: 0 };
  }
  return { ok: false, retryAfterMs: Math.ceil((1 - b.tokens) / rate) };
}

function sweep(now: number) {
  if (now - lastSweep < SWEEP_EVERY_MS && buckets.size < MAX_BUCKETS) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (now - b.updated > IDLE_MS) buckets.delete(k);
  // Still over the cap after sweeping means a flood from many addresses.
  // Failing open for a moment is better than growing without bound.
  if (buckets.size >= MAX_BUCKETS) buckets.clear();
}

export function tooMany(retryAfterMs: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Give it a moment and try again." },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } },
  );
}

/**
 * The common opening move: spend a token for this scope and caller, or
 * answer 429. `who` is the address by default; pass a user id for limits
 * that belong to an account rather than a connection.
 */
export function limited(req: Request, scope: keyof typeof LIMITS, who?: string | number): NextResponse | null {
  const key = `${scope}:${who ?? clientIp(req)}`;
  const r = take(key, LIMITS[scope]);
  return r.ok ? null : tooMany(r.retryAfterMs);
}

/** Largest JSON body any route accepts. The biggest real one is a few hundred bytes. */
export const MAX_JSON_BYTES = 16 * 1024;

export type Json = Record<string, unknown>;

/**
 * The request body as JSON, within a size cap.
 *
 * Read from the stream rather than Content-Length so a chunked body cannot
 * sidestep the cap. An empty body is an empty object, as the routes have
 * always treated it; anything else that is not JSON is a 400 and anything
 * over the cap a 413, instead of an error the route would turn into a 500.
 */
export async function readJson(
  req: Request,
  maxBytes = MAX_JSON_BYTES,
): Promise<{ ok: true; body: Json } | { ok: false; response: NextResponse }> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, response: tooLarge() };

  const reader = req.body?.getReader();
  if (!reader) return { ok: true, body: {} };
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, response: tooLarge() };
    }
    chunks.push(value);
  }
  const text = new TextDecoder().decode(concat(chunks, total)).trim();
  if (!text) return { ok: true, body: {} };
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, response: badJson() };
    }
    return { ok: true, body: parsed as Json };
  } catch {
    return { ok: false, response: badJson() };
  }
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

function tooLarge() {
  return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
}

function badJson() {
  return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
}

/**
 * Long-lived connections (the event stream) are counted rather than
 * bucketed: a cap per address and one for the whole venue, released when
 * the connection closes.
 */
const STREAMS_PER_IP = 8;
const STREAMS_TOTAL = 1_000;
const openStreams = new Map<string, number>();
let openStreamsTotal = 0;

/** Claim a stream slot. Returns a release function, or null when full. */
export function claimStream(ip: string): (() => void) | null {
  const mine = openStreams.get(ip) ?? 0;
  if (mine >= STREAMS_PER_IP || openStreamsTotal >= STREAMS_TOTAL) return null;
  openStreams.set(ip, mine + 1);
  openStreamsTotal++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openStreamsTotal = Math.max(0, openStreamsTotal - 1);
    const n = (openStreams.get(ip) ?? 1) - 1;
    if (n <= 0) openStreams.delete(ip);
    else openStreams.set(ip, n);
  };
}
