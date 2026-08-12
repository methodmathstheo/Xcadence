import { prisma } from "@/lib/db";
import { monthKey } from "@/lib/sim/time";
import { dcf, estimateInputs } from "@/lib/quant/dcf";
import type {
  ArtistHistoryPoint,
  ArtistSummary,
  ChartRow,
  DataProvider,
} from "@/lib/data/provider";

/**
 * Live provider backed by the simulation. Reads the durable mirror the tick
 * engine write-behinds to, so a page load always sees a coherent snapshot even
 * mid-tick; the SSE stream then patches it forward in real time.
 */
export class SimulatedDataProvider implements DataProvider {
  readonly name = "simulated";
  constructor(private runId: number) {}

  async getArtists(opts?: { includeInactive?: boolean }): Promise<ArtistSummary[]> {
    const rows = await prisma.artist.findMany({
      where: {
        runId: this.runId,
        ...(opts?.includeInactive ? {} : { active: true }),
      },
      orderBy: { listeners: "desc" },
    });
    return rows.map((a, i) => toSummary(a, i + 1));
  }

  async getArtistHistory(id: number): Promise<ArtistHistoryPoint[]> {
    const rows = await prisma.artistMonth.findMany({
      where: { artistId: id },
      orderBy: { monthKey: "asc" },
      select: { monthKey: true, dateMs: true, listeners: true, royalty: true, rank: true },
    });
    return rows;
  }

  async getChartSnapshot(dateMs: number): Promise<ChartRow[]> {
    const mk = monthKey(dateMs);
    const rows = await prisma.artistMonth.findMany({
      where: { monthKey: mk, artist: { runId: this.runId } },
      orderBy: { rank: "asc" },
      take: 200,
      select: {
        rank: true,
        listeners: true,
        artistId: true,
        artist: { select: { name: true, tier: true } },
      },
    });
    return rows.map((r) => ({
      rank: r.rank,
      artistId: r.artistId,
      name: r.artist.name,
      tier: r.artist.tier,
      listeners: r.listeners,
    }));
  }
}

type ArtistRow = {
  id: number; name: string; genre: string; tier: string; active: boolean;
  debutMs: number; exitMs: number | null; exitReason: string | null;
  listeners: number; listeners30: number; listeners90: number;
  volatility: number; royaltyRate: number;
  price: number; prevPrice: number; q: number; b: number; vMax: number;
  unitScale: number;
};

export function toSummary(a: ArtistRow, rank: number): ArtistSummary {
  const fairValue = dcf(estimateInputs(a)).pvPerContract;
  return {
    id: a.id,
    name: a.name,
    genre: a.genre,
    tier: a.tier,
    active: a.active,
    debutMs: a.debutMs,
    exitMs: a.exitMs,
    exitReason: a.exitReason,
    rank,
    listeners: a.listeners,
    growth30: a.listeners30 > 0 ? a.listeners / a.listeners30 - 1 : 0,
    growth90: a.listeners90 > 0 ? a.listeners / a.listeners90 - 1 : 0,
    volatility: a.volatility,
    royaltyRate: a.royaltyRate,
    monthlyRoyalty: a.listeners * a.royaltyRate,
    price: a.price,
    prevPrice: a.prevPrice,
    q: a.q,
    b: a.b,
    vMax: a.vMax,
    unitScale: a.unitScale,
    fairValue,
    divergence: fairValue > 0 ? a.price / fairValue - 1 : 0,
  };
}
