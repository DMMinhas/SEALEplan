import { describe, expect, it } from "vitest";
import { GRID } from "@/lib/grid";
import { rankSlots, scoreOf } from "@/lib/ranking";
import { nameKey } from "@/lib/normalize";
import { SEED_RESPONDENTS, seedSlots } from "../seed/respondents";
import { HAND_COMPUTED_TOP5 } from "./helpers/expected";

const people = SEED_RESPONDENTS.map((r) => ({ name: r.name, slots: seedSlots(r) }));

describe("weighted ranking", () => {
  it("weights Available = 1, If needed = 0.5", () => {
    expect(scoreOf(3, 3)).toBe(4.5);
  });

  it("seed has 30 respondents across the four countries", () => {
    expect(SEED_RESPONDENTS).toHaveLength(30);
    expect(new Set(SEED_RESPONDENTS.map((r) => r.country))).toEqual(new Set(["DE", "PK", "NP", "KH"]));
    expect(new Set(SEED_RESPONDENTS.map((r) => nameKey(r.name, r.organization))).size).toBe(30);
  });

  it("matches the hand-computed top 5 from the seed data", () => {
    const top = rankSlots(people, GRID, 5);
    expect(
      top.map(({ weekday, startHour, available, ifNeeded, score }) => ({
        weekday,
        startHour,
        available,
        ifNeeded,
        score,
      })),
    ).toEqual(HAND_COMPUTED_TOP5);
    expect(top[0].unavailable).toEqual(["Chantrea Lim", "Imran Sheikh", "Rajesh Karki"]);
    expect(top[1].unavailable).toEqual(["Anjali Rai", "Chantrea Lim", "Imran Sheikh"]);
  });

  it("breaks ties by more Available, then earlier slot", () => {
    const tie = rankSlots(
      [
        { name: "A", slots: [{ weekday: 1, startHour: 9, preference: "if_needed" }, { weekday: 1, startHour: 10, preference: "if_needed" }, { weekday: 2, startHour: 9, preference: "available" }] },
        { name: "B", slots: [{ weekday: 1, startHour: 9, preference: "if_needed" }, { weekday: 1, startHour: 10, preference: "if_needed" }] },
      ],
      GRID,
      3,
    );
    // Mon 09 & Mon 10: score 1 (0 available); Tue 09: score 1 (1 available) → Tue 09 first.
    expect(tie.map((s) => [s.weekday, s.startHour])).toEqual([[2, 9], [1, 9], [1, 10]]);
  });
});
