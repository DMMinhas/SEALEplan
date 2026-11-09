import { describe, expect, it } from "vitest";
import { cleanText, nameKey } from "@/lib/normalize";
import { buildGrid, GRID } from "@/lib/grid";

describe("name matching", () => {
  it("is case- and whitespace-insensitive", () => {
    expect(nameKey("  Anna   MÜLLER ", "tu  dresden")).toBe(nameKey("anna müller", "TU Dresden"));
  });
  it("normalises Unicode (NFKC)", () => {
    expect(nameKey("Müller", "X")).toBe(nameKey("Müller", "X"));
  });
  it("cannot collide across the name/org boundary", () => {
    expect(nameKey("a b", "c")).not.toBe(nameKey("a", "b c"));
  });
  it("cleans display text", () => {
    expect(cleanText("  Maya \t Example\n")).toBe("Maya Example");
  });
});

describe("grid config", () => {
  it("default grid is Mon–Fri 09:00–16:00 starts (40 slots)", () => {
    expect(GRID).toHaveLength(40);
    expect(GRID[0]).toEqual({ weekday: 1, startHour: 9 });
    expect(GRID.at(-1)).toEqual({ weekday: 5, startHour: 16 });
  });
  it("supports two-hour blocks", () => {
    expect(buildGrid({ days: [1], startHour: 9, endHour: 17, slotMinutes: 120 }).map((s) => s.startHour)).toEqual([9, 11, 13, 15]);
  });
  it("rejects non-hour slot lengths and the DST hour", () => {
    expect(() => buildGrid({ days: [1], startHour: 9, endHour: 17, slotMinutes: 30 })).toThrow();
    expect(() => buildGrid({ days: [1], startHour: 1, endHour: 4, slotMinutes: 60 })).toThrow();
  });
});
