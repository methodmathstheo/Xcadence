import { prisma } from "@/lib/db";
import { currentUser, type SessionUser } from "@/lib/auth/session";

/**
 * Who may reseed the run.
 *
 * Reset rebuilds the universe and discards every account's positions, so once
 * the link is shared it cannot be left open to whoever happens to click it.
 * The owner is `XCADENCE_OWNER_EMAIL` when set, and otherwise the first
 * account ever created — which is the person who stood the venue up.
 *
 * The clock controls (play, pause, speed, jump) stay open on purpose. They are
 * shared and a visitor moving them moves them for everybody, but nothing is
 * destroyed and the next tick carries on from wherever it lands.
 */
export async function isOwner(user: SessionUser | null): Promise<boolean> {
  if (!user) return false;

  const configured = process.env.XCADENCE_OWNER_EMAIL?.trim().toLowerCase();
  if (configured) return user.email.toLowerCase() === configured;

  // Guests are excluded from the fallback. Otherwise the first visitor to
  // click "try as guest" on a fresh database would inherit the power to
  // reseed the run and wipe everyone's book.
  if (user.isGuest) return false;
  const first = await prisma.user.findFirst({
    where: { isGuest: false },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return first?.id === user.id;
}

export async function currentOwner(): Promise<{ user: SessionUser | null; owner: boolean }> {
  const user = await currentUser();
  return { user, owner: await isOwner(user) };
}
