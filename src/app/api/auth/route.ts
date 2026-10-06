import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { engine } from "@/lib/engine/engine";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, currentUser, destroySession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_PASSWORD = 8;

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
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  if (action === "signout") {
    await destroySession();
    return NextResponse.json({ ok: true });
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return bad("Enter a valid email address.");
  }

  if (action === "register") {
    const displayName = String(body?.displayName ?? "").trim() || email.split("@")[0];
    if (password.length < MIN_PASSWORD) {
      return bad(`Use at least ${MIN_PASSWORD} characters.`);
    }
    if (displayName.length > 40) return bad("Display name is too long.");

    try {
      const user = await prisma.user.create({
        data: { email, displayName, passwordHash: await hashPassword(password) },
        select: { id: true, email: true, displayName: true },
      });
      await engine.ensureBook(user.id);
      await createSession(user.id);
      return NextResponse.json({ user });
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
    const row = await prisma.user.findUnique({ where: { email } });
    // Hash against a throwaway on a miss so a wrong email and a wrong password
    // take the same time to come back.
    const ok = row
      ? await verifyPassword(password, row.passwordHash)
      : await verifyPassword(password, await hashPassword("x")).then(() => false);
    if (!row || !ok) return bad("Email or password is incorrect.", 401);

    await engine.ensureBook(row.id);
    await createSession(row.id);
    return NextResponse.json({
      user: { id: row.id, email: row.email, displayName: row.displayName },
    });
  }

  return bad("Unknown action.");
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}
