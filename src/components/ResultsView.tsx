"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { pollConfig } from "@/config/poll.config";
import { GRID, WEEKDAY_LONG, WEEKDAY_SHORT, formatHour, gridDays, gridHours, slotKey } from "@/lib/grid";
import { formatDayOffset, referenceWeekStart, toLocal } from "@/lib/time";
import type { PublicResults } from "@/lib/results";

/** Sequential single-hue scale; text colour chosen per step for ≥ 4.5:1 contrast. */
const STEPS = [
  { bg: "#ffffff", fg: "#4b5563" },
  { bg: "#dbeafe", fg: "#1e3a8a" },
  { bg: "#93c5fd", fg: "#172554" },
  { bg: "#2563eb", fg: "#ffffff" },
  { bg: "#1d4ed8", fg: "#ffffff" },
  { bg: "#1e3a8a", fg: "#ffffff" },
];

function step(score: number, max: number) {
  if (score <= 0 || max <= 0) return STEPS[0];
  return STEPS[Math.min(STEPS.length - 1, 1 + Math.floor((score / max) * (STEPS.length - 1.0001)))];
}

export default function ResultsView({ data, nowIso }: { data: PublicResults; nowIso: string }) {
  const weekStart = useMemo(() => referenceWeekStart(DateTime.fromISO(nowIso)), [nowIso]);
  const [tz, setTz] = useState<string | null>(null);
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || null), []);

  const days = gridDays(GRID);
  const hours = gridHours(GRID);
  const byKey = new Map(data.slots.map((s) => [slotKey(s.weekday, s.startHour), s]));
  const best = new Set(data.best.map((b) => slotKey(b.weekday, b.startHour)));
  const max = Math.max(data.respondents, ...data.slots.map((s) => s.score));
  const abbrev = toLocal(days[0], hours[0], "UTC", weekStart).refAbbrev;
  const showLocal = tz && tz !== pollConfig.referenceTimeZone;

  return (
    <div>
      <h1 className="text-2xl font-bold">Group results</h1>
      <p className="mt-2 max-w-3xl text-muted">
        How many people can attend each weekly slot, in Berlin time ({abbrev}). Score = Available × 1 + If needed ×
        0.5. No individual answers are shown here.
      </p>

      <dl className="mt-4 grid max-w-xl grid-cols-2 gap-3">
        <div className="rounded-md border border-line bg-surface p-3">
          <dt className="text-sm text-muted">Respondents</dt>
          <dd className="text-3xl font-bold">{data.respondents}</dd>
        </div>
        <div className="rounded-md border border-line bg-surface p-3">
          <dt className="text-sm text-muted">Status</dt>
          <dd className="text-lg font-semibold">
            {data.closed ? "Closed" : "Open"}
            {data.deadlineAt && (
              <span className="block text-sm font-normal text-muted">
                {data.closed ? "Closed" : "Closes"}{" "}
                {DateTime.fromISO(data.deadlineAt).setZone(pollConfig.referenceTimeZone).toFormat("d LLL yyyy, HH:mm")}{" "}
                Berlin
              </span>
            )}
          </dd>
        </div>
      </dl>

      {data.respondents === 0 ? (
        <p className="mt-6">No responses yet.</p>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full table-fixed border-separate border-spacing-0.5 text-sm sm:border-spacing-1">
              <caption className="sr-only">
                Availability counts per slot. Each cell shows the number of people available, the number available if
                needed, and the weighted score.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="w-14 text-left text-xs font-semibold text-muted sm:w-28">
                    {abbrev}
                    {showLocal ? <span className="hidden sm:inline"> · your time</span> : ""}
                  </th>
                  {days.map((d) => (
                    <th key={d} scope="col" className="font-semibold">
                      <abbr title={WEEKDAY_LONG[d]} className="no-underline">
                        {WEEKDAY_SHORT[d]}
                      </abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hours.map((h) => {
                  const l = toLocal(days[0], h, tz ?? "UTC", weekStart);
                  return (
                    <tr key={h}>
                      <th scope="row" className="text-left font-normal">
                        <span className="font-semibold">{formatHour(h)}</span>
                        {showLocal && (
                          <span className="block text-xs text-muted">
                            {l.localTime}
                            {formatDayOffset(l.dayOffset)}
                          </span>
                        )}
                      </th>
                      {days.map((d) => {
                        const key = slotKey(d, h);
                        const s = byKey.get(key)!;
                        const c = step(s.score, max);
                        const isBest = best.has(key);
                        return (
                          <td
                            key={key}
                            className={`relative rounded-md border px-0.5 py-1.5 text-center align-middle sm:px-1.5 ${
                              isBest ? "border-[3px] border-amber-500" : "border-line"
                            }`}
                            style={{ background: c.bg, color: c.fg }}
                          >
                            <span className="sr-only">
                              {WEEKDAY_LONG[d]} {formatHour(h)}: {s.available} available, {s.ifNeeded} if needed,
                              score {s.score}
                              {isBest ? ", best slot" : ""}
                            </span>
                            <span aria-hidden="true" className="block font-bold leading-tight">
                              {isBest && "★ "}
                              {s.score}
                            </span>
                            <span aria-hidden="true" className="block whitespace-nowrap text-[11px] leading-tight sm:text-xs">
                              ✓{s.available} ~{s.ifNeeded}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            Each cell shows the score (bold), then ✓ Available and ~ If needed counts. Darker = more people. ★ and a
            thick outline mark the best slot.
          </p>

          <section aria-labelledby="countries-heading" className="mt-8 max-w-xl">
            <h2 id="countries-heading" className="text-lg font-semibold">
              Respondents by country
            </h2>
            <ul className="mt-3 space-y-2">
              {data.countries.map((c) => (
                <li key={c.country} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-2 text-sm">
                  <span>{c.countryName}</span>
                  <span className="h-3 rounded bg-surface" aria-hidden="true">
                    <span
                      className="block h-3 rounded bg-brand"
                      style={{ width: `${(c.count / data.respondents) * 100}%` }}
                    />
                  </span>
                  <span className="text-right font-semibold">{c.count}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
