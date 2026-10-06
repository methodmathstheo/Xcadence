import { NextResponse } from "next/server";
import { engine } from "@/lib/engine/engine";
import { currentUser, type SessionUser } from "@/lib/auth/session";
import type { Book, World } from "@/lib/engine/types";

export function unauthorized() {
  return NextResponse.json({ error: "Not signed in" }, { status: 401 });
}

/**
 * The common opening move for every route that touches money: the signed-in
 * user, the live world, and that user's book — created on the spot if this is
 * their first visit to the current run.
 */
export async function withBook(): Promise<
  { user: SessionUser; w: World; book: Book } | null
> {
  const user = await currentUser();
  if (!user) return null;
  const w = await engine.ensureLoaded();
  const book = await engine.ensureBook(user.id);
  return { user, w, book };
}
