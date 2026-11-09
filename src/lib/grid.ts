import { pollConfig } from "@/config/poll.config";

export type Preference = "available" | "if_needed";
export const PREFERENCES: readonly Preference[] = ["available", "if_needed"] as const;

export interface GridSlot {
  weekday: number; // ISO 1–7, reference time zone
  startHour: number; // 0–23, reference time zone
}

export interface SlotChoice extends GridSlot {
  preference: Preference;
}

export const WEEKDAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAY_LONG = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type GridConfig = {
  days: readonly number[];
  startHour: number;
  endHour: number;
  slotMinutes: number;
};

export function validateGridConfig(cfg: GridConfig): void {
  if (cfg.slotMinutes <= 0 || cfg.slotMinutes % 60 !== 0) {
    throw new Error("grid.slotMinutes must be a positive multiple of 60");
  }
  if (!cfg.days.length || cfg.days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
    throw new Error("grid.days must contain ISO weekdays 1–7");
  }
  if (!(cfg.startHour >= 0 && cfg.endHour <= 24 && cfg.startHour < cfg.endHour)) {
    throw new Error("grid.startHour/endHour out of range");
  }
  // 02:00–02:59 is skipped (March) or repeated (October) in Europe/Berlin.
  for (let h = cfg.startHour; h < cfg.endHour; h++) {
    if (h === 2) throw new Error("grid must not include 02:00–03:00 (DST transition hour)");
  }
}

export function buildGrid(cfg: GridConfig = pollConfig.grid): GridSlot[] {
  validateGridConfig(cfg);
  const step = cfg.slotMinutes / 60;
  const slots: GridSlot[] = [];
  for (const weekday of [...cfg.days].sort((a, b) => a - b)) {
    for (let h = cfg.startHour; h + step <= cfg.endHour; h += step) {
      slots.push({ weekday, startHour: h });
    }
  }
  return slots;
}

export const GRID: GridSlot[] = buildGrid();
export const SLOT_MINUTES: number = pollConfig.grid.slotMinutes;

export const slotKey = (weekday: number, startHour: number): string => `${weekday}-${startHour}`;

const GRID_KEYS = new Set(GRID.map((s) => slotKey(s.weekday, s.startHour)));
export const isGridSlot = (weekday: number, startHour: number): boolean =>
  GRID_KEYS.has(slotKey(weekday, startHour));

export const gridDays = (grid: GridSlot[] = GRID): number[] =>
  [...new Set(grid.map((s) => s.weekday))].sort((a, b) => a - b);
export const gridHours = (grid: GridSlot[] = GRID): number[] =>
  [...new Set(grid.map((s) => s.startHour))].sort((a, b) => a - b);

export const pad2 = (n: number): string => String(n).padStart(2, "0");
export const formatHour = (h: number): string => `${pad2(h)}:00`;

/** "Tue 10:00–11:00" in the reference time zone. */
export function slotRangeLabel(weekday: number, startHour: number, minutes = SLOT_MINUTES): string {
  const end = startHour + minutes / 60;
  return `${WEEKDAY_SHORT[weekday]} ${formatHour(startHour)}–${formatHour(end)}`;
}

export const PREFERENCE_LABEL: Record<Preference, string> = {
  available: "Available",
  if_needed: "If needed",
};
