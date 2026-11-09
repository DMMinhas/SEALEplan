import "server-only";
import { pollConfig } from "@/config/poll.config";
import type { Db } from "@/lib/db";
import { isGridSlot, type Preference, type SlotChoice } from "@/lib/grid";
import { nameKey, normalizeText } from "@/lib/normalize";
import { randomToken, sha256Hex } from "@/lib/crypto";

export class PollClosedError extends Error {
  constructor() {
    super("poll_closed");
  }
}

export interface PollRow {
  id: string;
  title: string;
  deadlineAt: string | null;
  closed: boolean;
}

export interface ResponseRecord {
  id: string;
  name: string;
  organization: string;
  country: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
  slots: SlotChoice[];
}

const iso = (v: unknown): string => (v instanceof Date ? v : new Date(String(v))).toISOString();

type RawPoll = { id: string; title: string; deadline_at: unknown; closed: boolean };
const toPoll = (r: RawPoll): PollRow => ({
  id: r.id,
  title: r.title,
  deadlineAt: r.deadline_at == null ? null : iso(r.deadline_at),
  closed: r.closed,
});

const POLL_COLUMNS = `id, title, deadline_at, (deadline_at is not null and deadline_at <= now()) as closed`;

/** Returns the single poll, creating it from config on first use. */
export async function ensurePoll(db: Db): Promise<PollRow> {
  const existing = await db.query<RawPoll>(`select ${POLL_COLUMNS} from poll limit 1`);
  if (existing[0]) return toPoll(existing[0]);
  await db.query(
    `insert into poll (title, slot_config) values ($1, $2::jsonb) on conflict (singleton) do nothing`,
    [pollConfig.title, JSON.stringify(pollConfig.grid)],
  );
  const created = await db.query<RawPoll>(`select ${POLL_COLUMNS} from poll limit 1`);
  return toPoll(created[0]);
}

export async function setDeadline(db: Db, pollId: string, deadlineAt: string | null): Promise<PollRow> {
  const rows = await db.query<RawPoll>(
    `update poll set deadline_at = $2::timestamptz, updated_at = now() where id = $1 returning ${POLL_COLUMNS}`,
    [pollId, deadlineAt],
  );
  return toPoll(rows[0]);
}

export interface UpsertInput {
  name: string;
  organization: string;
  country: string;
  timezone: string;
  slots: SlotChoice[];
  editToken?: string | null;
}

export interface UpsertResult {
  id: string;
  editToken: string;
  created: boolean;
  /** True when an existing response was overwritten by matching name + organization. */
  replacedByName: boolean;
}

async function upsertOnce(db: Db, pollId: string, input: UpsertInput): Promise<UpsertResult> {
  return db.transaction(async (tx) => {
    // FOR SHARE: concurrent submissions proceed, but a deadline change waits for them (and vice versa).
    const poll = await tx.query<{ closed: boolean }>(
      `select (deadline_at is not null and deadline_at <= now()) as closed from poll where id = $1 for share`,
      [pollId],
    );
    if (!poll[0]) throw new Error("poll_not_found");
    if (poll[0].closed) throw new PollClosedError();

    const key = nameKey(input.name, input.organization);
    const byKey = (
      await tx.query<{ id: string }>(
        `select id from response where poll_id = $1 and name_key = $2 for update`,
        [pollId, key],
      )
    )[0];

    let byToken: { id: string } | undefined;
    if (input.editToken) {
      byToken = (
        await tx.query<{ id: string }>(
          `select id from response where poll_id = $1 and edit_token_hash = $2 for update`,
          [pollId, await sha256Hex(input.editToken)],
        )
      )[0];
    }

    // Name + organization wins (spec: re-entering them overwrites). Otherwise the
    // edit token lets the same browser correct the spelling of its own entry.
    const target = byKey ?? byToken;
    const tokenOwnsTarget = !!target && !!byToken && byToken.id === target.id;
    const editToken = tokenOwnsTarget ? input.editToken! : randomToken();
    const tokenHash = await sha256Hex(editToken);

    let id: string;
    if (target) {
      id = target.id;
      await tx.query(
        `update response
            set name = $2, name_key = $3, organization = $4, country = $5, timezone = $6,
                edit_token_hash = $7, updated_at = now()
          where id = $1`,
        [id, input.name, key, input.organization, input.country, input.timezone, tokenHash],
      );
      await tx.query(`delete from response_slot where response_id = $1`, [id]);
    } else {
      const rows = await tx.query<{ id: string }>(
        `insert into response (poll_id, name, name_key, organization, country, timezone, edit_token_hash)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [pollId, input.name, key, input.organization, input.country, input.timezone, tokenHash],
      );
      id = rows[0].id;
    }

    if (input.slots.length) {
      const params: unknown[] = [id];
      const values = input.slots.map((s) => {
        params.push(s.weekday, s.startHour, s.preference);
        const n = params.length;
        return `($1, $${n - 2}, $${n - 1}, $${n}::slot_preference)`;
      });
      await tx.query(
        `insert into response_slot (response_id, weekday, start_hour, preference) values ${values.join(", ")}`,
        params,
      );
    }

    return {
      id,
      editToken,
      created: !target,
      replacedByName: !!target && !tokenOwnsTarget,
    };
  });
}

const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";

export async function upsertResponse(db: Db, pollId: string, input: UpsertInput): Promise<UpsertResult> {
  try {
    return await upsertOnce(db, pollId, input);
  } catch (e) {
    // Two first-time submissions for the same person raced; the retry turns into an update.
    if (isUniqueViolation(e)) return upsertOnce(db, pollId, input);
    throw e;
  }
}

type RawResponse = {
  id: string;
  name: string;
  organization: string;
  country: string;
  timezone: string;
  created_at: unknown;
  updated_at: unknown;
};
type RawSlot = { response_id: string; weekday: number; start_hour: number; preference: Preference };

function assemble(rows: RawResponse[], slots: RawSlot[]): ResponseRecord[] {
  const byId = new Map<string, SlotChoice[]>();
  for (const s of slots) {
    const weekday = Number(s.weekday);
    const startHour = Number(s.start_hour);
    if (!isGridSlot(weekday, startHour)) continue; // grid config changed since submission
    const list = byId.get(s.response_id) ?? [];
    list.push({ weekday, startHour, preference: s.preference });
    byId.set(s.response_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    organization: r.organization,
    country: r.country.trim(),
    timezone: r.timezone,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    slots: (byId.get(r.id) ?? []).sort((a, b) => a.weekday - b.weekday || a.startHour - b.startHour),
  }));
}

const RESPONSE_COLUMNS = `id, name, organization, country, timezone, created_at, updated_at`;

export async function getResponseByToken(
  db: Db,
  pollId: string,
  editToken: string,
): Promise<ResponseRecord | null> {
  const rows = await db.query<RawResponse>(
    `select ${RESPONSE_COLUMNS} from response where poll_id = $1 and edit_token_hash = $2`,
    [pollId, await sha256Hex(editToken)],
  );
  if (!rows[0]) return null;
  const slots = await db.query<RawSlot>(
    `select response_id, weekday, start_hour, preference from response_slot where response_id = $1`,
    [rows[0].id],
  );
  return assemble(rows, slots)[0];
}

export interface ResponseFilter {
  country?: string | null;
  organization?: string | null;
}

export async function listResponses(db: Db, pollId: string): Promise<ResponseRecord[]> {
  const rows = await db.query<RawResponse>(
    `select ${RESPONSE_COLUMNS} from response where poll_id = $1 order by lower(name), created_at`,
    [pollId],
  );
  const slots = await db.query<RawSlot>(
    `select s.response_id, s.weekday, s.start_hour, s.preference
       from response_slot s join response r on r.id = s.response_id
      where r.poll_id = $1`,
    [pollId],
  );
  return assemble(rows, slots);
}

export function applyFilter(rows: ResponseRecord[], f: ResponseFilter): ResponseRecord[] {
  const org = f.organization ? normalizeText(f.organization) : null;
  return rows.filter(
    (r) =>
      (!f.country || r.country === f.country) &&
      (!org || normalizeText(r.organization) === org),
  );
}

export async function deleteResponse(db: Db, pollId: string, id: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `delete from response where poll_id = $1 and id = $2 returning id`,
    [pollId, id],
  );
  return rows.length > 0;
}

/** Aggregates only – this query never selects names, organizations or time zones. */
export interface PublicAggregates {
  respondents: number;
  slots: { weekday: number; startHour: number; available: number; ifNeeded: number }[];
  countries: { country: string; count: number }[];
}

export async function getPublicAggregates(db: Db, pollId: string): Promise<PublicAggregates> {
  const slotRows = await db.query<{
    weekday: number;
    start_hour: number;
    available: number;
    if_needed: number;
  }>(
    `select s.weekday, s.start_hour,
            (count(*) filter (where s.preference = 'available'))::int as available,
            (count(*) filter (where s.preference = 'if_needed'))::int as if_needed
       from response_slot s join response r on r.id = s.response_id
      where r.poll_id = $1
      group by s.weekday, s.start_hour`,
    [pollId],
  );
  const countryRows = await db.query<{ country: string; count: number }>(
    `select country, count(*)::int as count from response where poll_id = $1
      group by country order by count desc, country`,
    [pollId],
  );
  return {
    respondents: countryRows.reduce((n, r) => n + Number(r.count), 0),
    slots: slotRows
      .map((r) => ({
        weekday: Number(r.weekday),
        startHour: Number(r.start_hour),
        available: Number(r.available),
        ifNeeded: Number(r.if_needed),
      }))
      .filter((s) => isGridSlot(s.weekday, s.startHour)),
    countries: countryRows.map((r) => ({ country: r.country.trim(), count: Number(r.count) })),
  };
}
