import { prisma } from "@/lib/db";
import { createRun } from "@/lib/sim/universe";

export const DEFAULT_SEED = 20260901;

/** The single active run, created on first use. */
export async function getOrCreateRun() {
  const existing = await prisma.run.findFirst({
    where: { active: true },
    orderBy: { id: "desc" },
  });
  if (existing) return existing;

  const id = await createRun(DEFAULT_SEED);
  return prisma.run.findUniqueOrThrow({ where: { id } });
}

export async function getActiveRun() {
  return prisma.run.findFirst({ where: { active: true }, orderBy: { id: "desc" } });
}

/**
 * Reset to seed. The previous run is deleted outright rather than archived —
 * this is a single-user sandbox and keeping stale universes around would make
 * every cohort query ambiguous about which run it is measuring.
 */
export async function resetRun(seed: number) {
  await prisma.run.deleteMany({});
  const id = await createRun(seed);
  return prisma.run.findUniqueOrThrow({ where: { id } });
}
