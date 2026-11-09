"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { pollConfig } from "@/config/poll.config";
import { WEEKDAY_SHORT, gridDays, slotRangeLabel, type SlotChoice } from "@/lib/grid";
import { normalizeText } from "@/lib/normalize";
import { referenceWeekStart, toLocal } from "@/lib/time";
import type { AdminData } from "@/lib/admin-data";

const REF = pollConfig.referenceTimeZone;

function slotSummary(slots: SlotChoice[]): { day: string; text: string }[] {
  return gridDays()
    .map((d) => {
      const s = slots.filter((x) => x.weekday === d);
      return {
        day: WEEKDAY_SHORT[d],
        text: s.map((x) => `${x.startHour}${x.preference === "available" ? "✓" : "~"}`).join(" "),
      };
    })
    .filter((x) => x.text);
}

export default function AdminDashboard({ nowIso }: { nowIso: string }) {
  const weekStart = useMemo(() => referenceWeekStart(DateTime.fromISO(nowIso)), [nowIso]);
  const [country, setCountry] = useState("");
  const [organization, setOrganization] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deadlineInput, setDeadlineInput] = useState("");
  const [expected, setExpected] = useState("");

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (country) p.set("country", country);
    if (organization) p.set("organization", organization);
    return p.toString();
  }, [country, organization]);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/admin/responses${qs ? `?${qs}` : ""}`, { cache: "no-store" });
    if (res.status === 401) {
      setError("Your admin session has expired. Open the secret admin link again.");
      return;
    }
    if (!res.ok) {
      setError("Could not load responses.");
      return;
    }
    const d: AdminData = await res.json();
    setData(d);
    setDeadlineInput(d.deadlineAt ? DateTime.fromISO(d.deadlineAt).setZone(REF).toFormat("yyyy-LL-dd'T'HH:mm") : "");
  }, [qs]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveDeadline(value: string | null) {
    setMessage(null);
    let deadlineAt: string | null = null;
    if (value) {
      const dt = DateTime.fromISO(value, { zone: REF });
      if (!dt.isValid) {
        setMessage("Please enter a valid date and time.");
        return;
      }
      deadlineAt = dt.toISO();
    }
    const res = await fetch("/api/admin/poll", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deadlineAt }),
    });
    setMessage(res.ok ? (deadlineAt ? "Deadline saved." : "Deadline removed – the poll is open.") : "Could not save the deadline.");
    await load();
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete the response from ${name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/responses/${id}`, { method: "DELETE" });
    setMessage(res.ok ? `Deleted the response from ${name}.` : "Could not delete the response.");
    await load();
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/";
  }

  const missing = useMemo(() => {
    if (!data) return null;
    const lines = expected
      .split(/\r?\n/)
      .map((l) => l.split(/[,\t;]/)[0].trim())
      .filter(Boolean);
    if (!lines.length) return null;
    const responded = new Set(data.allNames.map(normalizeText));
    const expectedSet = new Set(lines.map(normalizeText));
    return {
      total: lines.length,
      missing: lines.filter((l) => !responded.has(normalizeText(l))),
      unexpected: data.allNames.filter((n) => !expectedSet.has(normalizeText(n))),
    };
  }, [data, expected]);

  if (error) {
    return (
      <p role="alert" className="rounded-md border border-red-800 bg-red-50 p-4 text-red-950">
        {error}
      </p>
    );
  }
  if (!data) return <p>Loading…</p>;

  const deadlineBerlin = data.deadlineAt ? DateTime.fromISO(data.deadlineAt).setZone(REF) : null;
  const filtered = !!(country || organization);
  const btn = "rounded-md border border-gray-400 bg-white px-3 py-2 text-sm font-medium hover:bg-surface";

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Coordinator view</h1>
        <div className="flex gap-2">
          <a className={btn} href={`/api/admin/export.csv${qs ? `?${qs}` : ""}`}>
            Export CSV{filtered ? " (filtered)" : ""}
          </a>
          <button type="button" className={btn} onClick={logout}>
            Sign out
          </button>
        </div>
      </div>

      {message && (
        <p role="status" className="rounded-md border border-blue-800 bg-blue-50 p-3 text-sm text-blue-950">
          {message}
        </p>
      )}

      {/* Deadline */}
      <section aria-labelledby="deadline-h" className="rounded-md border border-line p-4">
        <h2 id="deadline-h" className="text-lg font-semibold">
          Deadline
        </h2>
        <p className="mt-1 text-sm">
          Status: <strong>{data.closed ? "Closed" : "Open"}</strong>
          {deadlineBerlin
            ? ` · ${data.closed ? "closed" : "closes"} ${deadlineBerlin.toFormat("ccc d LLL yyyy, HH:mm")} ${
                deadlineBerlin.isInDST ? "CEST" : "CET"
              }`
            : " · no deadline set"}
        </p>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveDeadline(deadlineInput || null);
          }}
        >
          <div>
            <label htmlFor="deadline" className="block text-sm font-semibold">
              Deadline (Berlin time)
            </label>
            <input
              id="deadline"
              type="datetime-local"
              value={deadlineInput}
              onChange={(e) => setDeadlineInput(e.target.value)}
              className="mt-1 rounded-md border border-gray-400 px-3 py-2"
            />
          </div>
          <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
            Save deadline
          </button>
          {data.deadlineAt && (
            <button type="button" className={btn} onClick={() => void saveDeadline(null)}>
              Remove deadline
            </button>
          )}
        </form>
      </section>

      {/* Filters */}
      <section aria-labelledby="filter-h">
        <h2 id="filter-h" className="text-lg font-semibold">
          Filter
        </h2>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="f-country" className="block text-sm font-semibold">
              Country
            </label>
            <select
              id="f-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="mt-1 rounded-md border border-gray-400 bg-white px-3 py-2"
            >
              <option value="">All countries</option>
              {data.facets.countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-org" className="block text-sm font-semibold">
              Organization
            </label>
            <select
              id="f-org"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="mt-1 max-w-[18rem] rounded-md border border-gray-400 bg-white px-3 py-2"
            >
              <option value="">All organizations</option>
              {data.facets.organizations.map((o) => (
                <option key={o.name} value={o.name}>
                  {o.name} ({o.count})
                </option>
              ))}
            </select>
          </div>
          {filtered && (
            <button
              type="button"
              className={btn}
              onClick={() => {
                setCountry("");
                setOrganization("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        <p className="mt-2 text-sm text-muted" aria-live="polite">
          Showing {data.responses.length} of {data.totalRespondents} respondents. The ranking below uses the filtered set.
        </p>
      </section>

      {/* Ranking */}
      <section aria-labelledby="rank-h">
        <h2 id="rank-h" className="text-lg font-semibold">
          Top 5 slots
        </h2>
        <p className="text-sm text-muted">Score = Available × 1 + If needed × 0.5. Ties: more “Available” first.</p>
        <ol className="mt-3 space-y-3">
          {data.topSlots.map((s, i) => {
            const pk = toLocal(s.weekday, s.startHour, "Asia/Karachi", weekStart);
            const np = toLocal(s.weekday, s.startHour, "Asia/Kathmandu", weekStart);
            const kh = toLocal(s.weekday, s.startHour, "Asia/Phnom_Penh", weekStart);
            return (
              <li key={`${s.weekday}-${s.startHour}`} className="rounded-md border border-line p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">
                    #{i + 1} · {slotRangeLabel(s.weekday, s.startHour)} {pk.refAbbrev}
                  </p>
                  <p className="text-sm">
                    <strong>Score {s.score}</strong> · ✓ {s.available} available · ~ {s.ifNeeded} if needed
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted">
                  PK {pk.localTime} · NP {np.localTime} · KH {kh.localTime} (week of {weekStart.toFormat("d LLL")})
                </p>
                <p className="mt-2 text-sm">
                  <span className="font-semibold">Cannot attend ({s.unavailable.length}):</span>{" "}
                  {s.unavailable.length ? s.unavailable.join(", ") : "everyone can attend"}
                </p>
                {s.ifNeededNames.length > 0 && (
                  <p className="mt-1 text-sm text-muted">
                    <span className="font-semibold">Only if needed ({s.ifNeededNames.length}):</span>{" "}
                    {s.ifNeededNames.join(", ")}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* People */}
      <section aria-labelledby="people-h">
        <h2 id="people-h" className="text-lg font-semibold">
          Responses
        </h2>
        <p className="text-sm text-muted">
          Slots in Berlin time: start hour followed by ✓ (available) or ~ (if needed).
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-line text-left">
                <th scope="col" className="py-2 pr-3">Name</th>
                <th scope="col" className="py-2 pr-3">Organization</th>
                <th scope="col" className="py-2 pr-3">Country</th>
                <th scope="col" className="py-2 pr-3">Time zone</th>
                <th scope="col" className="py-2 pr-3">Slots</th>
                <th scope="col" className="py-2 pr-3">Updated</th>
                <th scope="col" className="py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.responses.map((r) => (
                <tr key={r.id} className="border-b border-line align-top">
                  <th scope="row" className="py-2 pr-3 text-left font-semibold">
                    {r.name}
                  </th>
                  <td className="py-2 pr-3">{r.organization}</td>
                  <td className="py-2 pr-3">{r.countryName}</td>
                  <td className="py-2 pr-3">{r.timezone}</td>
                  <td className="py-2 pr-3">
                    {r.slots.length === 0 ? (
                      <span className="text-muted">none</span>
                    ) : (
                      <ul>
                        {slotSummary(r.slots).map((x) => (
                          <li key={x.day} className="whitespace-nowrap">
                            <span className="font-semibold">{x.day}</span> {x.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {DateTime.fromISO(r.updatedAt).setZone(REF).toFormat("d LLL, HH:mm")}
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => void remove(r.id, r.name)}
                      className="rounded-md border border-red-800 px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-50"
                      aria-label={`Delete response from ${r.name}`}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Missing helper */}
      <section aria-labelledby="missing-h" className="rounded-md border border-line p-4">
        <h2 id="missing-h" className="text-lg font-semibold">
          Who has not responded yet?
        </h2>
        <label htmlFor="expected" className="mt-2 block text-sm">
          Paste the expected participants, one name per line (anything after a comma or tab is ignored). Matching
          ignores case and extra spaces. This list stays in your browser.
        </label>
        <textarea
          id="expected"
          rows={6}
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
          className="mt-2 w-full rounded-md border border-gray-400 p-2 font-mono text-sm"
        />
        {missing && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2" aria-live="polite">
            <div>
              <h3 className="font-semibold">
                Not responded ({missing.missing.length} of {missing.total})
              </h3>
              {missing.missing.length ? (
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {missing.missing.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm">Everyone on the list has responded.</p>
              )}
            </div>
            {missing.unexpected.length > 0 && (
              <div>
                <h3 className="font-semibold">Responded but not on your list ({missing.unexpected.length})</h3>
                <p className="text-xs text-muted">Check for spelling differences.</p>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {missing.unexpected.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
