import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, withWriteRetry } from "@/lib/db";
import { engine } from "@/lib/engine/engine";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, currentUser, destroySession } from "@/lib/auth/session";
import { createGuest, GUEST_TTL_MS } from "@/lib/auth/guests";
import { limited, LIMITS, readJson, take, tooMany } from "@/lib/http/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_PASSWORD = 8;
/** scrypt is happy with far more; this just keeps the request honest. */
const MAX_PASSWORD = 200;
/** RFC 5321's limit on an address. */
const MAX_EMAIL = 254;

/** Whoami, for the header and the landing page. */
export async function GET() {
  const user = await currentUser();
  return NextResponse.json({ user });
}

/**
 * Register, sign in, or sign out — one endpoint, switched on `action`.
 *
 * Registration opens a book straight away so the first thing a new trader
 * sees is funded cash rather than an empty portfolio that fills in later.
 */
export async function POST(req: Request) {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const action = String(body?.action ?? "");

  if (action === "signout") {
    await destroySession();
    return NextResponse.json({ ok: true });
  }

  if (action === "guest") {
    // Per address, then for the venue as a whole: a guest costs a scrypt and
    // a row, and nothing about "try as guest" should let one party mint
    // thousands of them.
    const perIp = limited(req, "guest");
    if (perIp) return perIp;
    const everyone = take("guest:all", LIMITS.guestGlobal);
    if (!everyone.ok) return tooMany(everyone.retryAfterMs);

    const user = await createGuest();
    await createSession(user.id, GUEST_TTL_MS);
    await openBook(user.id);
    return NextResponse.json({ user: { ...user, isGuest: true } });
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (email.length > MAX_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return bad("Enter a valid email address.");
  }
  if (password.length > MAX_PASSWORD) return bad("That password is too long.");

  if (action === "register") {
    const slow = limited(req, "register");
    if (slow) return slow;

    const displayName = String(body?.displayName ?? "").trim() || email.split("@")[0];
    if (password.length < MIN_PASSWORD) {
      return bad(`Use at least ${MIN_PASSWORD} characters.`);
    }
    if (displayName.length > 40) return bad("Display name is too long.");

    try {
      const hashed = await hashPassword(password);
      const user = await withWriteRetry("user.create", () =>
        prisma.user.create({
          data: { email, displayName, passwordHash: hashed },
          select: { id: true, email: true, displayName: true },
        }),
      );
      await createSession(user.id);
      await openBook(user.id);
      return NextResponse.json({ user: { ...user, isGuest: false } });
    } catch (err) {
      // P2002 is the unique index on email. Reported plainly: this is a
      // private sandbox, not a service where account enumeration matters, and
      // "that email is taken" is the only message that tells someone what to
      // actually do next.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return bad("That email already has an account. Sign in instead.");
      }
      throw err;
    }
  }

  if (action === "signin") {
    // Ten tries, then one a minute, per address. Enough for anyone who has
    // forgotten which password they used; nothing like enough to guess one.
    const slow = limited(req, "signin") ?? limited(req, "signinAccount", email);
    if (slow) return slow;

    const row = await prisma.user.findUnique({ where: { email } });
    // Hash against a throwaway on a miss so a wrong email and a wrong password
    // take the same time to come back.
    const ok = row
      ? await verifyPassword(password, row.passwordHash)
      : await verifyPassword(password, await hashPassword("x")).then(() => false);
    if (!row || !ok) return bad("Email or password is incorrect.", 401);

    await createSession(row.id);
    await openBook(row.id);
    return NextResponse.json({
      user: {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        isGuest: row.isGuest,
      },
    });
  }

  return bad("Unknown action.");
}

/**
 * Open the trader's book, best effort.
 *
 * Deliberately after the session is issued and deliberately swallowed. A book
 * is created on demand by every route that needs one, so doing it here is a
 * convenience — it means a new trader's first page already shows funded cash
 * rather than filling in a moment later. It is not a reason to fail a sign-in
 * that has otherwise succeeded, which is what happened when the engine ran
 * first: the user row was written, the engine threw, no cookie was set, and
 * the retry was told the email was already taken.
 */
async function openBook(userId: number) {
  try {
    await engine.ensureBook(userId);
  } catch (err) {
    console.error("[auth] could not open book eagerly; deferring", err);
  }
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}
