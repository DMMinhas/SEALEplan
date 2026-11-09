import "server-only";
import type { Db } from "@/lib/db";
import { applyFilter, ensurePoll, listResponses, type ResponseRecord } from "@/lib/repo";
import { GRID, WEEKDAY_SHORT, formatHour, slotKey } from "@/lib/grid";
import { rankSlots, type RankedSlot } from "@/lib/ranking";
import { countryName } from "@/lib/countries";
import { normalizeText } from "@/lib/normalize";

export interface AdminData {
  deadlineAt: string | null;
  closed: boolean;
  totalRespondents: number;
  filter: { country: string | null; organization: string | null };
  facets: {
    countries: { code: string; name: string; count: number }[];
    organizations: { name: string; count: number }[];
  };
  responses: (ResponseRecord & { countryName: string })[];
  topSlots: RankedSlot[];
  /** Names of all respondents (unfiltered) for the "not responded yet" helper. */
  allNames: string[];
}

export function filterFromUrl(url: URL) {
  const country = url.searchParams.get("country");
  const organization = url.searchParams.get("organization");
  return {
    country: country && /^[A-Z]{2}$/.test(country) ? country : null,
    organization: organization && organization.length <= 150 ? organization : null,
  };
}

export async function buildAdminData(
  db: Db,
  filter: { country: string | null; organization: string | null },
): Promise<AdminData> {
  const poll = await ensurePoll(db);
  const all = await listResponses(db, poll.id);
  const rows = applyFilter(all, filter);

  const countryCounts = new Map<string, number>();
  const orgCounts = new Map<string, { name: string; count: number }>();
  for (const r of all) {
    countryCounts.set(r.country, (countryCounts.get(r.country) ?? 0) + 1);
    const k = normalizeText(r.organization);
    const o = orgCounts.get(k) ?? { name: r.organization, count: 0 };
    o.count++;
    orgCounts.set(k, o);
  }

  return {
    deadlineAt: poll.deadlineAt,
    closed: poll.closed,
    totalRespondents: all.length,
    filter,
    facets: {
      countries: [...countryCounts]
        .map(([code, count]) => ({ code, name: countryName(code), count }))
        .sort((a, b) => a.name.localeCompare(b.name, "en")),
      organizations: [...orgCounts.values()].sort((a, b) => a.name.localeCompare(b.name, "en")),
    },
    responses: rows.map((r) => ({ ...r, countryName: countryName(r.country) })),
    topSlots: rankSlots(rows, GRID, 5),
    allNames: all.map((r) => r.name),
  };
}

/** Neutralise spreadsheet formula injection and quote every cell. */
export function csvCell(value: string): string {
  const v = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${v.replace(/"/g, '""')}"`;
}

export function responsesToCsv(rows: ResponseRecord[]): string {
  const slotCols = GRID.map((s) => `${WEEKDAY_SHORT[s.weekday]} ${formatHour(s.startHour)} CET/CEST`);
  const header = ["Name", "Organization", "Country", "Time zone", "Last updated (UTC)", ...slotCols];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    const prefs = new Map(r.slots.map((s) => [slotKey(s.weekday, s.startHour), s.preference]));
    const cells = [
      r.name,
      r.organization,
      r.country,
      r.timezone,
      r.updatedAt,
      ...GRID.map((s) => prefs.get(slotKey(s.weekday, s.startHour)) ?? ""),
    ];
    lines.push(cells.map(csvCell).join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n"; // BOM so Excel reads UTF-8
}
