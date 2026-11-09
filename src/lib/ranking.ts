import { slotKey, type GridSlot, type Preference, type SlotChoice } from "@/lib/grid";

export const WEIGHTS: Record<Preference, number> = { available: 1, if_needed: 0.5 };

export const scoreOf = (available: number, ifNeeded: number): number =>
  available * WEIGHTS.available + ifNeeded * WEIGHTS.if_needed;

export interface SlotStat extends GridSlot {
  available: number;
  ifNeeded: number;
  score: number;
}

export interface RankedSlot extends SlotStat {
  /** People who marked the slot neither Available nor If needed. */
  unavailable: string[];
  ifNeededNames: string[];
}

export interface PersonForRanking {
  name: string;
  slots: SlotChoice[];
}

/** Higher score first; ties → more "Available", then earlier in the week. */
export function compareStats(a: SlotStat, b: SlotStat): number {
  return (
    b.score - a.score ||
    b.available - a.available ||
    a.weekday - b.weekday ||
    a.startHour - b.startHour
  );
}

export function rankSlots(people: PersonForRanking[], grid: GridSlot[], limit = 5): RankedSlot[] {
  const byPerson = people.map((p) => ({
    name: p.name,
    prefs: new Map(p.slots.map((s) => [slotKey(s.weekday, s.startHour), s.preference])),
  }));
  const byName = (a: string, b: string) => a.localeCompare(b, "en");

  const stats: RankedSlot[] = grid.map(({ weekday, startHour }) => {
    const key = slotKey(weekday, startHour);
    let available = 0;
    let ifNeeded = 0;
    const unavailable: string[] = [];
    const ifNeededNames: string[] = [];
    for (const p of byPerson) {
      const pref = p.prefs.get(key);
      if (pref === "available") available++;
      else if (pref === "if_needed") {
        ifNeeded++;
        ifNeededNames.push(p.name);
      } else unavailable.push(p.name);
    }
    return {
      weekday,
      startHour,
      available,
      ifNeeded,
      score: scoreOf(available, ifNeeded),
      unavailable: unavailable.sort(byName),
      ifNeededNames: ifNeededNames.sort(byName),
    };
  });

  return stats.sort(compareStats).slice(0, limit);
}
