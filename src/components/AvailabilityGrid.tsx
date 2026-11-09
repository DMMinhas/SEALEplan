"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { DateTime } from "luxon";
import {
  GRID,
  PREFERENCE_LABEL,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  formatHour,
  gridDays,
  gridHours,
  slotKey,
  type Preference,
} from "@/lib/grid";
import { formatDayOffset, toLocal, type LocalSlotTime } from "@/lib/time";

export type Selection = Map<string, Preference>;
type Tool = Preference | "erase";

interface Props {
  value: Selection;
  setValue: React.Dispatch<React.SetStateAction<Selection>>;
  timeZone: string | null;
  weekStart: DateTime;
  disabled?: boolean;
}

const ICON: Record<Preference, string> = { available: "✓", if_needed: "~" };

function cellClasses(pref: Preference | undefined, disabled?: boolean, layout = "justify-center px-1 text-xs"): string {
  const base = `flex h-full w-full select-none items-center gap-1 rounded-md border font-semibold transition-colors ${layout}`;
  const state =
    pref === "available"
      ? "border-avail bg-avail text-white"
      : pref === "if_needed"
        ? "stripes-ifneeded border-dashed border-ifneeded-line text-ifneeded-ink"
        : "border-line bg-white text-muted hover:bg-blue-50";
  return `${base} ${state} ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`;
}

export default function AvailabilityGrid({ value, setValue, timeZone, weekStart, disabled }: Props) {
  const days = useMemo(() => gridDays(GRID), []);
  const hours = useMemo(() => gridHours(GRID), []);
  const instructionsId = useId();
  const [tool, setTool] = useState<Tool>("available");
  const [focus, setFocus] = useState({ r: 0, c: 0 });
  const [mobileDay, setMobileDay] = useState(days[0]);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const drag = useRef<{ paint: Preference | null } | null>(null);

  const local = useMemo(() => {
    const m = new Map<string, LocalSlotTime>();
    for (const s of GRID) {
      m.set(slotKey(s.weekday, s.startHour), toLocal(s.weekday, s.startHour, timeZone ?? "Europe/Berlin", weekStart));
    }
    return m;
  }, [timeZone, weekStart]);

  const apply = useCallback(
    (key: string, pref: Preference | null) => {
      setValue((prev) => {
        if ((prev.get(key) ?? null) === pref) return prev;
        const next = new Map(prev);
        if (pref) next.set(key, pref);
        else next.delete(key);
        return next;
      });
    },
    [setValue],
  );

  /** Pointer/tap semantics: paint with the tool; painting over the same state erases. */
  const paintValueFor = (key: string): Preference | null => {
    if (tool === "erase") return null;
    return value.get(key) === tool ? null : tool;
  };

  useEffect(() => {
    const stop = () => (drag.current = null);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  const label = (weekday: number, hour: number) => {
    const key = slotKey(weekday, hour);
    const l = local.get(key)!;
    const pref = value.get(key);
    const localPart = timeZone ? `, ${l.localTime} your time${formatDayOffset(l.dayOffset)}` : "";
    return `${WEEKDAY_LONG[weekday]} ${formatHour(hour)} ${l.refAbbrev}${localPart}: ${
      pref ? PREFERENCE_LABEL[pref] : "Unavailable"
    }`;
  };

  const moveFocus = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(hours.length - 1, r));
    const cc = Math.max(0, Math.min(days.length - 1, c));
    setFocus({ r: rr, c: cc });
    cellRefs.current.get(slotKey(days[cc], hours[rr]))?.focus();
  };

  const onCellKeyDown = (e: React.KeyboardEvent, r: number, c: number, key: string) => {
    const k = e.key;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [r - 1, c],
      ArrowDown: [r + 1, c],
      ArrowLeft: [r, c - 1],
      ArrowRight: [r, c + 1],
      Home: [r, 0],
      End: [r, days.length - 1],
    };
    if (moves[k]) {
      e.preventDefault();
      moveFocus(...moves[k]);
      return;
    }
    if (disabled) return;
    if (k === "1") apply(key, "available");
    else if (k === "2") apply(key, "if_needed");
    else if (k === "0" || k === "Delete" || k === "Backspace") apply(key, null);
    else return;
    e.preventDefault();
  };

  const counts = useMemo(() => {
    let a = 0;
    let i = 0;
    for (const p of value.values()) {
      if (p === "available") a++;
      else i++;
    }
    return { a, i };
  }, [value]);

  const rowLocal = (hour: number) => local.get(slotKey(days[0], hour))!;
  const abbrev = rowLocal(hours[0]).refAbbrev;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <fieldset disabled={disabled}>
          <legend className="text-sm font-semibold">Click or drag to mark slots as:</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {(["available", "if_needed", "erase"] as Tool[]).map((t) => (
              <label
                key={t}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${
                  tool === t ? "border-brand bg-blue-50 ring-2 ring-brand" : "border-gray-400 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="paint-tool"
                  value={t}
                  checked={tool === t}
                  onChange={() => setTool(t)}
                  className="h-4 w-4 accent-[#1e40af]"
                />
                {t === "available" && (
                  <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded bg-avail text-xs text-white">✓</span>
                )}
                {t === "if_needed" && (
                  <span aria-hidden="true" className="stripes-ifneeded inline-flex h-5 w-5 items-center justify-center rounded border border-dashed border-ifneeded-line text-xs text-ifneeded-ink">~</span>
                )}
                {t === "erase" && (
                  <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded border border-line bg-white text-xs">✕</span>
                )}
                {t === "erase" ? "Unavailable (erase)" : PREFERENCE_LABEL[t]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted" aria-live="polite">
            {counts.a} available · {counts.i} if needed
          </p>
          <button
            type="button"
            disabled={disabled || value.size === 0}
            onClick={() => {
              if (window.confirm("Clear all selected slots?")) setValue(new Map());
            }}
            className="rounded-md border border-gray-400 bg-white px-3 py-2 text-sm font-medium hover:bg-surface disabled:opacity-50"
          >
            Clear all
          </button>
        </div>
      </div>

      <p id={instructionsId} className="mt-3 text-sm text-muted">
        Empty cells mean you are unavailable. Keyboard: use the arrow keys to move between slots; Enter or
        Space applies the selected option; <kbd className="font-mono">1</kbd> = Available,{" "}
        <kbd className="font-mono">2</kbd> = If needed, <kbd className="font-mono">0</kbd> or Delete = Unavailable.
      </p>

      {/* Desktop / tablet: week grid */}
      <div className="mt-4 hidden sm:block">
        <table
          className="w-full table-fixed border-separate border-spacing-1"
          aria-describedby={instructionsId}
          onPointerMove={(e) => {
            // Hit-test instead of pointerenter so drag-painting also works with touch/pen.
            if (!drag.current || disabled) return;
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const slot = (el?.closest("[data-slot]") as HTMLElement | null)?.dataset.slot;
            if (slot) apply(slot, drag.current.paint);
          }}
        >
          <caption className="sr-only">
            Weekly slots in {abbrev} with your local time. Each cell is a button showing your answer.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-36 px-1 text-left text-xs font-semibold text-muted">
                {abbrev}
                {timeZone ? " · your time" : ""}
              </th>
              {days.map((d) => (
                <th key={d} scope="col" className="text-sm font-semibold">
                  <span aria-hidden="true">{WEEKDAY_SHORT[d]}</span>
                  <span className="sr-only">{WEEKDAY_LONG[d]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((h, r) => {
              const rl = rowLocal(h);
              return (
                <tr key={h}>
                  <th scope="row" className="px-1 text-left align-middle text-sm font-normal">
                    <span className="font-semibold">
                      {formatHour(h)} {rl.refAbbrev}
                    </span>
                    {timeZone && (
                      <span className="block text-xs text-muted">
                        {rl.localTime} local{formatDayOffset(rl.dayOffset)}
                      </span>
                    )}
                  </th>
                  {days.map((d, c) => {
                    const key = slotKey(d, h);
                    const pref = value.get(key);
                    return (
                      <td key={key} className="relative h-11 p-0">
                        <button
                          type="button"
                          ref={(el) => {
                            if (el) cellRefs.current.set(key, el);
                            else cellRefs.current.delete(key);
                          }}
                          data-slot={key}
                          tabIndex={focus.r === r && focus.c === c ? 0 : -1}
                          aria-label={label(d, h)}
                          aria-disabled={disabled || undefined}
                          className={cellClasses(pref, disabled)}
                          style={{ touchAction: "none" }}
                          onFocus={() => setFocus({ r, c })}
                          onPointerDown={(e) => {
                            if (disabled || e.button !== 0) return;
                            e.preventDefault();
                            (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
                            const paint = paintValueFor(key);
                            drag.current = { paint };
                            apply(key, paint);
                            setFocus({ r, c });
                          }}
                          onClick={(e) => {
                            // detail === 0: keyboard or assistive tech (pointer handled above)
                            if (e.detail === 0 && !disabled) apply(key, paintValueFor(key));
                          }}
                          onKeyDown={(e) => onCellKeyDown(e, r, c, key)}
                        >
                          {pref && (
                            <>
                              <span aria-hidden="true">{ICON[pref]}</span>
                              <span aria-hidden="true" className="hidden truncate md:inline">
                                {PREFERENCE_LABEL[pref]}
                              </span>
                            </>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phones: day-by-day view */}
      <div className="mt-4 sm:hidden">
        <div role="tablist" aria-label="Day" className="grid grid-cols-5 gap-1">
          {days.map((d) => {
            const n = hours.filter((h) => value.has(slotKey(d, h))).length;
            const selected = d === mobileDay;
            return (
              <button
                key={d}
                type="button"
                role="tab"
                id={`day-tab-${d}`}
                aria-selected={selected}
                aria-controls={`day-panel-${d}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setMobileDay(d)}
                onKeyDown={(e) => {
                  const i = days.indexOf(d);
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    const next = days[(i + (e.key === "ArrowRight" ? 1 : days.length - 1)) % days.length];
                    setMobileDay(next);
                    document.getElementById(`day-tab-${next}`)?.focus();
                  }
                }}
                className={`rounded-md border px-1 py-2 text-sm font-semibold ${
                  selected ? "border-brand bg-brand text-white" : "border-gray-400 bg-white"
                }`}
              >
                {WEEKDAY_SHORT[d]}
                <span className="block text-xs font-normal">{n ? `${n} set` : "–"}</span>
              </button>
            );
          })}
        </div>
        <div role="tabpanel" id={`day-panel-${mobileDay}`} aria-labelledby={`day-tab-${mobileDay}`} className="mt-3">
          <ul className="space-y-2">
            {hours.map((h) => {
              const key = slotKey(mobileDay, h);
              const pref = value.get(key);
              const l = local.get(key)!;
              return (
                <li key={key}>
                  <button
                    type="button"
                    aria-label={label(mobileDay, h)}
                    aria-disabled={disabled || undefined}
                    onClick={() => !disabled && apply(key, paintValueFor(key))}
                    className={`${cellClasses(pref, disabled, "justify-between px-3 py-2 text-sm")} min-h-12`}
                  >
                    <span className="text-left">
                      <span className="font-semibold">
                        {formatHour(h)} {l.refAbbrev}
                      </span>
                      {timeZone && (
                        <span className="ml-2 font-normal">
                          · {l.localTime} local{formatDayOffset(l.dayOffset)}
                        </span>
                      )}
                    </span>
                    <span aria-hidden="true">{pref ? `${ICON[pref]} ${PREFERENCE_LABEL[pref]}` : "Unavailable"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
