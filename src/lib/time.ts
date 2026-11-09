/**
 * Time-zone handling.
 *
 * A slot is (ISO weekday, start hour) in Berlin wall-clock time. Its local
 * time for a participant depends on the *date* (Berlin observes DST, the
 * partner countries do not), so every conversion is done for a concrete week:
 * we take the slot's occurrence in that week, build the instant in
 * Europe/Berlin and convert it to the participant's IANA zone. All offsets
 * come from the IANA database via Luxon/Intl – nothing is hard-coded, which is
 * what makes Nepal's +05:45 come out right.
 */
import { DateTime } from "luxon";
import { pollConfig } from "@/config/poll.config";
import { GRID, SLOT_MINUTES, type GridSlot } from "@/lib/grid";

export const REF_TZ = pollConfig.referenceTimeZone;

/** Monday 00:00 (Berlin) of the week containing `now`; on weekends, the next Monday. */
export function referenceWeekStart(now: Date | DateTime = new Date()): DateTime {
  const dt = (now instanceof Date ? DateTime.fromJSDate(now) : now).setZone(REF_TZ).startOf("day");
  return dt.weekday >= 6 ? dt.plus({ days: 8 - dt.weekday }) : dt.minus({ days: dt.weekday - 1 });
}

/** The instant a slot starts in the given week (Berlin wall clock → absolute instant). */
export function slotStart(weekday: number, startHour: number, weekStart: DateTime): DateTime {
  const day = weekStart.setZone(REF_TZ).plus({ days: weekday - 1 });
  return DateTime.fromObject(
    { year: day.year, month: day.month, day: day.day, hour: startHour, minute: 0 },
    { zone: REF_TZ },
  );
}

/** "CET" in winter, "CEST" in summer. */
export function refAbbrev(dt: DateTime): "CET" | "CEST" {
  return dt.setZone(REF_TZ).isInDST ? "CEST" : "CET";
}

export interface LocalSlotTime {
  refStart: DateTime;
  refAbbrev: "CET" | "CEST";
  localStart: DateTime;
  localEnd: DateTime;
  /** "14:45" */
  localTime: string;
  localEndTime: string;
  /** Local calendar day minus Berlin calendar day (-1, 0, +1). */
  dayOffset: number;
}

export function toLocal(
  weekday: number,
  startHour: number,
  timeZone: string,
  weekStart: DateTime,
  slotMinutes: number = SLOT_MINUTES,
): LocalSlotTime {
  const refStart = slotStart(weekday, startHour, weekStart);
  const localStart = refStart.setZone(timeZone);
  const localEnd = localStart.plus({ minutes: slotMinutes });
  const refDay = DateTime.fromISO(refStart.toISODate()!, { zone: "UTC" });
  const localDay = DateTime.fromISO(localStart.toISODate()!, { zone: "UTC" });
  return {
    refStart,
    refAbbrev: refAbbrev(refStart),
    localStart,
    localEnd,
    localTime: localStart.toFormat("HH:mm"),
    localEndTime: localEnd.toFormat("HH:mm"),
    dayOffset: Math.round(localDay.diff(refDay, "days").days),
  };
}

export interface LocalShift {
  /** Monday (Berlin) of the first week whose local times differ from the reference week. */
  fromWeek: DateTime;
  /** Positive = later in local time, negative = earlier. */
  deltaMinutes: number;
  sampleSlot: GridSlot;
  before: LocalSlotTime;
  after: LocalSlotTime;
}

/**
 * Looks ahead week by week and reports the first week in which the
 * participant's local time for the grid shifts relative to `weekStart`
 * (caused by Berlin's or the participant's own DST change).
 */
export function findLocalShift(
  timeZone: string,
  weekStart: DateTime,
  weeks: number = pollConfig.dstLookaheadWeeks,
  sampleSlot: GridSlot = GRID[0],
): LocalShift | null {
  const before = toLocal(sampleSlot.weekday, sampleSlot.startHour, timeZone, weekStart);
  const offsetGap = (s: LocalSlotTime) => s.localStart.offset - s.refStart.offset;
  for (let w = 1; w <= weeks; w++) {
    const ws = weekStart.plus({ weeks: w });
    const after = toLocal(sampleSlot.weekday, sampleSlot.startHour, timeZone, ws);
    const delta = offsetGap(after) - offsetGap(before);
    if (delta !== 0) {
      return { fromWeek: ws, deltaMinutes: delta, sampleSlot, before, after };
    }
  }
  return null;
}

/** Monday of the first week in the look-ahead window whose Berlin abbreviation changes. */
export function nextRefDstChange(
  weekStart: DateTime,
  weeks: number = pollConfig.dstLookaheadWeeks,
): { fromWeek: DateTime; abbrev: "CET" | "CEST" } | null {
  const first = refAbbrev(slotStart(1, 12, weekStart));
  for (let w = 1; w <= weeks; w++) {
    const ws = weekStart.plus({ weeks: w });
    const ab = refAbbrev(slotStart(1, 12, ws));
    if (ab !== first) return { fromWeek: ws, abbrev: ab };
  }
  return null;
}

/** Legacy IANA names some browsers still report → current canonical names. */
const TZ_ALIASES: Record<string, string> = {
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Dacca": "Asia/Dhaka",
  "Asia/Thimbu": "Asia/Thimphu",
  "Europe/Kiev": "Europe/Kyiv",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Pacific/Enderbury": "Pacific/Kanton",
};

export function canonicalTimeZone(tz: string): string {
  return TZ_ALIASES[tz] ?? tz;
}

const TZ_PATTERN = /^[A-Za-z0-9_+\-]+(\/[A-Za-z0-9_+\-]+){0,2}$/;

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64 || !TZ_PATTERN.test(tz)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return DateTime.now().setZone(tz).isValid;
  } catch {
    return false;
  }
}

/** "UTC+05:45" for the given zone at the given instant. */
export function utcOffsetLabel(timeZone: string, at: DateTime = DateTime.now()): string {
  const dt = at.setZone(timeZone);
  return dt.isValid ? `UTC${dt.toFormat("ZZ")}` : "";
}

export function formatDayOffset(dayOffset: number): string {
  if (dayOffset === 0) return "";
  return dayOffset > 0 ? ` (+${dayOffset}d)` : ` (${dayOffset}d)`;
}

/** "1 hour", "45 minutes", "1 h 30 min". */
export function formatMinutes(mins: number): string {
  const m = Math.abs(mins);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h} h ${r} min`;
  if (h) return h === 1 ? "1 hour" : `${h} hours`;
  return `${r} minutes`;
}
