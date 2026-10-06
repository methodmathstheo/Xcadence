import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma, withWriteRetry } from "@/lib/db";

export const COOKIE = "xc_session";

/** Thirty days. Long enough that a shared demo link does not keep logging people out. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: number;
  email: string;
  displayName: string;
  isGuest: boolean;
}

/**
 * Opaque 32-byte token. Only its SHA-256 goes to the database, so a leaked
 * copy of the SQLite file cannot be replayed as a login — the same reason the
 * password column holds a digest rather than the password.
 *
 * SHA-256 with no work factor is right here, unlike for passwords: the token
 * is 256 bits of CSPRNG output, so there is no dictionary to walk.
 */
export async function createSession(userId: number, ttlMs = TTL_MS): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMs);

  await withWriteRetry("session.create", () =>
    prisma.session.create({ data: { tokenHash: hash(token), userId, expiresAt } }),
  );

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** The signed-in user, or null. Expired rows are swept on the way past. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const row = await prisma.session
    .findUnique({
      where: { tokenHash: hash(token) },
      include: {
        user: { select: { id: true, email: true, displayName: true, isGuest: true } },
      },
    })
    .catch(() => null);
  if (!row) return null;

  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }
  return row.user;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hash(token) } }).catch(() => {});
  }
  jar.delete(COOKIE);
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
