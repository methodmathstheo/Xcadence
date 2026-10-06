import { randomBytes } from "node:crypto";
import { prisma, withWriteRetry } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

/**
 * Guest accounts.
 *
 * A visitor can trade without handing over an email or a password. The
 * approach is deliberately boring: a guest gets a real row in `User`, flagged,
 * so every piece of machinery downstream — books, positions, royalties, the
 * portfolio analytics — works on it unchanged. "Try as guest" is then
 * genuinely identical to an account rather than a reduced imitation of one.
 *
 * What makes it a guest is that nothing is kept. The session is short, the
 * email is a placeholder in a reserved domain that can never receive mail, the
 * password hash is random and unusable, and the row is deleted once the last
 * session lapses — which cascades the account, positions, trades and equity
 * curve with it.
 */

/** Guest sessions last a day. Long enough to come back after lunch. */
export const GUEST_TTL_MS = 24 * 60 * 60 * 1000;

/** Reserved by RFC 2606; guaranteed never to resolve. */
const GUEST_DOMAIN = "guest.invalid";

export function isGuestEmail(email: string): boolean {
  return email.endsWith(`@${GUEST_DOMAIN}`);
}

/**
 * Open a throwaway account.
 *
 * The password hash is a random string nobody holds the input to, so there is
 * no credential here to leak and no way to sign back in as this guest once the
 * cookie is gone.
 */
export async function createGuest() {
  const tag = randomBytes(5).toString("hex");
  const passwordHash = await hashPassword(randomBytes(24).toString("base64url"));
  return withWriteRetry("guest.create", () =>
    prisma.user.create({
      data: {
        email: `guest-${tag}@${GUEST_DOMAIN}`,
        displayName: `Guest ${tag.slice(0, 4).toUpperCase()}`,
        passwordHash,
        isGuest: true,
      },
      select: { id: true, email: true, displayName: true },
    }),
  );
}

/**
 * Delete guests with no live session.
 *
 * The cascade on `User` takes the account, positions, offering positions,
 * trades and equity points with it, which is the whole point — a guest that
 * has gone leaves nothing behind to grow the volume. Guests created in the
 * last few minutes are spared so a sweep cannot race a sign-up that has not
 * written its session row yet.
 */
export async function sweepGuests(): Promise<number> {
  const cutoff = new Date(Date.now() - 5 * 60_000);
  const { count } = await prisma.user.deleteMany({
    where: {
      isGuest: true,
      createdAt: { lt: cutoff },
      sessions: { none: { expiresAt: { gt: new Date() } } },
    },
  });
  if (count > 0) console.log(`[guests] swept ${count} lapsed guest account(s)`);
  return count;
}

let sweeper: NodeJS.Timeout | null = null;

/** Sweep at boot and hourly after. Idempotent. */
export function startGuestSweeper() {
  if (sweeper) return;
  void sweepGuests().catch((err) => console.error("[guests] sweep failed", err));
  sweeper = setInterval(
    () => void sweepGuests().catch((err) => console.error("[guests] sweep failed", err)),
    60 * 60_000,
  );
  // Never hold the process open on housekeeping alone.
  sweeper.unref?.();
}
