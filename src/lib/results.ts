import "server-only";
import type { Db } from "@/lib/db";
import { ensurePoll, getPublicAggregates } from "@/lib/repo";
import { GRID, slotKey } from "@/lib/grid";
import { compareStats, scoreOf, type SlotStat } from "@/lib/ranking";
import { countryName } from "@/lib/countries";

/**
 * Public results payload. Built only from aggregate queries: it contains no
 * names, organizations or time zones by construction.
 */
export interface PublicResults {
  respondents: number;
  deadlineAt: string | null;
  closed: boolean;
  slots: SlotStat[];
  best: { weekday: number; startHour: number }[];
  countries: { country: string; countryName: string; count: number }[];
}

export async function buildPublicResults(db: Db): Promise<PublicResults> {
  const poll = await ensurePoll(db);
  const agg = await getPublicAggregates(db, poll.id);
  const byKey = new Map(agg.slots.map((s) => [slotKey(s.weekday, s.startHour), s]));
  const slots: SlotStat[] = GRID.map(({ weekday, startHour }) => {
    const s = byKey.get(slotKey(weekday, startHour));
    const available = s?.available ?? 0;
    const ifNeeded = s?.ifNeeded ?? 0;
    return { weekday, startHour, available, ifNeeded, score: scoreOf(available, ifNeeded) };
  });
  const sorted = [...slots].sort(compareStats);
  const top = sorted[0];
  const best =
    top && top.score > 0
      ? sorted
          .filter((s) => s.score === top.score && s.available === top.available)
          .map(({ weekday, startHour }) => ({ weekday, startHour }))
      : [];
  return {
    respondents: agg.respondents,
    deadlineAt: poll.deadlineAt,
    closed: poll.closed,
    slots,
    best,
    countries: agg.countries.map((c) => ({ ...c, countryName: countryName(c.country) })),
  };
}
