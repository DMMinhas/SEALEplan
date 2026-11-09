import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  findLocalShift,
  isValidTimeZone,
  nextRefDstChange,
  referenceWeekStart,
  toLocal,
} from "@/lib/time";

// Tue 10:00 Europe/Berlin
const TUE = 2;
const TEN = 10;

const winterWeek = referenceWeekStart(new Date("2027-01-12T12:00:00Z")); // week of Mon 11 Jan 2027
const summerWeek = referenceWeekStart(new Date("2027-03-30T12:00:00Z")); // after DST change on Sun 28 Mar 2027

describe("acceptance: Tue 10:00 Europe/Berlin in partner time zones", () => {
  it("winter (CET, UTC+1)", () => {
    expect(toLocal(TUE, TEN, "Europe/Berlin", winterWeek).refAbbrev).toBe("CET");
    expect(toLocal(TUE, TEN, "Asia/Karachi", winterWeek).localTime).toBe("14:00");
    expect(toLocal(TUE, TEN, "Asia/Kathmandu", winterWeek).localTime).toBe("14:45");
    expect(toLocal(TUE, TEN, "Asia/Phnom_Penh", winterWeek).localTime).toBe("16:00");
  });

  it("after the March DST change (CEST, UTC+2) each shifts one hour earlier", () => {
    expect(toLocal(TUE, TEN, "Europe/Berlin", summerWeek).refAbbrev).toBe("CEST");
    expect(toLocal(TUE, TEN, "Asia/Karachi", summerWeek).localTime).toBe("13:00");
    expect(toLocal(TUE, TEN, "Asia/Kathmandu", summerWeek).localTime).toBe("13:45");
    expect(toLocal(TUE, TEN, "Asia/Phnom_Penh", summerWeek).localTime).toBe("15:00");
  });

  it("the slot stays 10:00 for Berlin participants all year", () => {
    expect(toLocal(TUE, TEN, "Europe/Berlin", winterWeek).localTime).toBe("10:00");
    expect(toLocal(TUE, TEN, "Europe/Berlin", summerWeek).localTime).toBe("10:00");
  });

  it("the week right before the change is still winter time", () => {
    const lastWinter = referenceWeekStart(new Date("2027-03-26T12:00:00Z")); // Fri 26 Mar
    expect(toLocal(TUE, TEN, "Asia/Kathmandu", lastWinter).localTime).toBe("14:45");
  });

  it("switches back after the October change", () => {
    const autumn = referenceWeekStart(new Date("2027-11-02T12:00:00Z")); // after Sun 31 Oct 2027
    expect(toLocal(TUE, TEN, "Asia/Kathmandu", autumn).localTime).toBe("14:45");
    expect(toLocal(TUE, TEN, "Europe/Berlin", autumn).refAbbrev).toBe("CET");
  });

  it("09:00 CET = 13:45 in Nepal in winter (45-minute offset)", () => {
    expect(toLocal(1, 9, "Asia/Kathmandu", winterWeek).localTime).toBe("13:45");
    expect(toLocal(1, 9, "Asia/Kathmandu", winterWeek).localEndTime).toBe("14:45");
  });
});

describe("reference week & DST look-ahead", () => {
  it("weekends roll forward to the next Monday", () => {
    const ws = referenceWeekStart(new Date("2027-01-16T12:00:00Z")); // Saturday
    expect(ws.toISODate()).toBe("2027-01-18");
    expect(ws.zoneName).toBe("Europe/Berlin");
  });

  it("finds the March change and a one-hour earlier shift for Kathmandu", () => {
    const shift = findLocalShift("Asia/Kathmandu", winterWeek, 26);
    expect(shift).not.toBeNull();
    expect(shift!.fromWeek.toISODate()).toBe("2027-03-29");
    expect(shift!.deltaMinutes).toBe(-60);
    expect(shift!.before.localTime).toBe("13:45");
    expect(shift!.after.localTime).toBe("12:45");
  });

  it("reports no shift for Berlin participants", () => {
    expect(findLocalShift("Europe/Berlin", winterWeek, 26)).toBeNull();
  });

  it("detects the Berlin abbreviation change", () => {
    const c = nextRefDstChange(winterWeek, 26);
    expect(c?.abbrev).toBe("CEST");
    expect(c?.fromWeek.toISODate()).toBe("2027-03-29");
  });

  it("flags local day changes for far-east zones", () => {
    const late = toLocal(5, 16, "Pacific/Auckland", winterWeek); // Fri 16:00 CET = Sat 04:00 NZDT
    expect(late.dayOffset).toBe(1);
    expect(late.localTime).toBe("04:00");
  });

  it("validates IANA zones", () => {
    expect(isValidTimeZone("Asia/Kathmandu")).toBe(true);
    expect(isValidTimeZone("Asia/Katmandu")).toBe(true); // legacy alias
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("Europe/Berlin; drop table")).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });

  it("uses wall-clock Berlin time, not a fixed UTC offset", () => {
    const w = toLocal(TUE, TEN, "UTC", winterWeek);
    const s = toLocal(TUE, TEN, "UTC", summerWeek);
    expect(w.localTime).toBe("09:00");
    expect(s.localTime).toBe("08:00");
    expect(DateTime.fromISO("2027-03-30T10:00", { zone: "Europe/Berlin" }).offset).toBe(120);
  });
});
