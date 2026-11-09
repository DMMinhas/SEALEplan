import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { setDbForTesting, type Db } from "@/lib/db";
import { createTestDb } from "./helpers/pglite";
import { buildSeedSql } from "../seed/build-seed-sql";
import { HAND_COMPUTED_TOP5 } from "./helpers/expected";

import { POST as submit } from "@/app/api/responses/route";
import { POST as loadMine } from "@/app/api/responses/me/route";
import { GET as results } from "@/app/api/results/route";
import { GET as adminList } from "@/app/api/admin/responses/route";
import { DELETE as adminDelete } from "@/app/api/admin/responses/[id]/route";
import { PATCH as adminPatchPoll } from "@/app/api/admin/poll/route";
import { GET as adminCsv } from "@/app/api/admin/export.csv/route";
import { createSessionValue, ADMIN_COOKIE } from "@/lib/admin-auth";

const ADMIN_TOKEN = "test-admin-token-0123456789abcdef";
process.env.ADMIN_TOKEN = ADMIN_TOKEN;
process.env.APP_SECRET = "test-app-secret-0123456789abcdef0123456789";

let pg: PGlite;
let db: Db;
let ipCounter = 0;

const BASE = "http://localhost";

function post(path: string, body: unknown, ip = `10.0.0.${++ipCounter % 250}`) {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip },
    body: JSON.stringify(body),
  });
}

const adminReq = (path: string, init: RequestInit = {}, token: string | null = ADMIN_TOKEN) =>
  new Request(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string>),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });

const baseSubmission = {
  name: "Maya Example",
  organization: "Demo University",
  country: "NP",
  timezone: "Asia/Kathmandu",
  slots: [
    { weekday: 2, startHour: 10, preference: "available" },
    { weekday: 3, startHour: 9, preference: "if_needed" },
  ],
};

async function count(sql: string): Promise<number> {
  const r = await pg.query<{ n: number }>(sql);
  return Number(r.rows[0].n);
}

beforeAll(async () => {
  ({ pg, db } = await createTestDb());
  setDbForTesting(db);
});

afterAll(async () => {
  setDbForTesting(null);
  await pg.close();
});

beforeEach(async () => {
  await pg.exec("delete from response; delete from rate_limit; update poll set deadline_at = null;");
});

describe("participant submission", () => {
  it("creates a response and returns an edit token", async () => {
    const res = await submit(post("/api/responses", baseSubmission));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.editToken).toBe("string");
    expect(await count("select count(*) n from response_slot")).toBe(2);
  });

  it("acceptance: same name + organization with different casing/spacing overwrites, not duplicates", async () => {
    await submit(post("/api/responses", baseSubmission));
    const res = await submit(
      post("/api/responses", {
        ...baseSubmission,
        name: "  maya   EXAMPLE ",
        organization: "demo  university",
        slots: [{ weekday: 5, startHour: 16, preference: "available" }],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.replacedByName).toBe(true);
    expect(await count("select count(*) n from response")).toBe(1);
    const slots = await pg.query<{ weekday: number; start_hour: number }>(
      "select weekday, start_hour from response_slot",
    );
    expect(slots.rows).toEqual([{ weekday: 5, start_hour: 16 }]);
    const name = await pg.query<{ name: string }>("select name from response");
    expect(name.rows[0].name).toBe("maya EXAMPLE"); // latest display form, whitespace cleaned
  });

  it("the edit token loads the response and keeps working after an update", async () => {
    const first = await (await submit(post("/api/responses", baseSubmission))).json();
    const second = await (
      await submit(post("/api/responses", { ...baseSubmission, editToken: first.editToken }))
    ).json();
    expect(second.editToken).toBe(first.editToken);
    expect(second.replacedByName).toBe(false);

    const res = await loadMine(post("/api/responses/me", { editToken: first.editToken }));
    expect(res.status).toBe(200);
    const { response } = await res.json();
    expect(response.name).toBe("Maya Example");
    expect(response.slots).toHaveLength(2);

    const missing = await loadMine(post("/api/responses/me", { editToken: "x".repeat(43) }));
    expect(missing.status).toBe(404);
  });

  it("the edit token lets the same browser correct its name spelling", async () => {
    const first = await (await submit(post("/api/responses", baseSubmission))).json();
    await submit(post("/api/responses", { ...baseSubmission, name: "Maya Exampel", editToken: first.editToken }));
    const rows = await pg.query<{ name: string }>("select name from response");
    expect(rows.rows).toEqual([{ name: "Maya Exampel" }]);
  });

  it("rejects invalid input server-side", async () => {
    const bad = await submit(
      post("/api/responses", {
        ...baseSubmission,
        country: "XX",
        timezone: "Mars/Base",
        slots: [{ weekday: 6, startHour: 10, preference: "available" }],
      }),
    );
    expect(bad.status).toBe(422);
    const body = await bad.json();
    expect(Object.keys(body.fields).sort()).toEqual(["country", "slots", "timezone"]);

    const extra = await submit(post("/api/responses", { ...baseSubmission, admin: true }));
    expect(extra.status).toBe(422);

    const empty = await submit(post("/api/responses", { ...baseSubmission, name: "   " }));
    expect(empty.status).toBe(422);
    expect(await count("select count(*) n from response")).toBe(0);
  });

  it("honeypot submissions get a fake success and are not stored", async () => {
    const res = await submit(post("/api/responses", { ...baseSubmission, company_website: "http://spam" }));
    expect(res.status).toBe(200);
    expect(await count("select count(*) n from response")).toBe(0);
  });

  it("rate-limits per IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await submit(post("/api/responses", { ...baseSubmission, name: `Person ${i}` }, "192.0.2.77"));
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
    const stored = await pg.query<{ bucket_key: string }>("select bucket_key from rate_limit");
    expect(stored.rows.some((r) => r.bucket_key.includes("192.0.2.77"))).toBe(false);
  });
});

describe("deadline", () => {
  it("acceptance: submissions after the deadline are rejected server-side", async () => {
    await pg.exec("update poll set deadline_at = now() - interval '1 minute'");
    const res = await submit(post("/api/responses", baseSubmission));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("poll_closed");
    expect(await count("select count(*) n from response")).toBe(0);
  });

  it("existing responses cannot be overwritten after the deadline either", async () => {
    await submit(post("/api/responses", baseSubmission));
    await pg.exec("update poll set deadline_at = now() - interval '1 second'");
    const res = await submit(post("/api/responses", { ...baseSubmission, slots: [] }));
    expect(res.status).toBe(403);
    expect(await count("select count(*) n from response_slot")).toBe(2);
  });

  it("admin can set and clear the deadline", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const set = await adminPatchPoll(
      adminReq("/api/admin/poll", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deadlineAt: future }),
      }),
    );
    expect(set.status).toBe(200);
    expect((await set.json()).closed).toBe(false);

    const past = await adminPatchPoll(
      adminReq("/api/admin/poll", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deadlineAt: "2020-01-01T00:00:00+01:00" }),
      }),
    );
    expect((await past.json()).closed).toBe(true);
    expect((await submit(post("/api/responses", baseSubmission))).status).toBe(403);
  });
});

describe("public results", () => {
  it("acceptance: never returns names, organizations or time zones", async () => {
    await pg.exec(buildSeedSql());
    await submit(post("/api/responses", baseSubmission));
    const res = await results();
    expect(res.status).toBe(200);
    const raw = await res.text();
    const body = JSON.parse(raw);

    expect(Object.keys(body).sort()).toEqual(
      ["best", "closed", "countries", "deadlineAt", "respondents", "slots"].sort(),
    );
    expect(body.respondents).toBe(31);
    for (const forbidden of [
      "Maya Example",
      "Anna Becker",
      "Imran Sheikh",
      "Demo University",
      "Mekong University",
      "Asia/Kathmandu",
      "Europe/Berlin",
      "Asia/",
      "Europe/",
      "name\":\"",
      "timezone",
      "organization",
    ]) {
      expect(raw).not.toContain(forbidden);
    }
    for (const s of body.slots) {
      expect(Object.keys(s).sort()).toEqual(["available", "ifNeeded", "score", "startHour", "weekday"]);
    }
    for (const c of body.countries) {
      expect(Object.keys(c).sort()).toEqual(["count", "country", "countryName"]);
    }
  });

  it("country breakdown and heatmap counts match the seed", async () => {
    await pg.exec(buildSeedSql());
    const body = await (await results()).json();
    expect(body.respondents).toBe(30);
    const byCountry = Object.fromEntries(body.countries.map((c: { country: string; count: number }) => [c.country, c.count]));
    expect(byCountry).toEqual({ DE: 8, PK: 8, NP: 7, KH: 7 });
    const wed10 = body.slots.find((s: { weekday: number; startHour: number }) => s.weekday === 3 && s.startHour === 10);
    expect(wed10).toEqual({ weekday: 3, startHour: 10, available: 20, ifNeeded: 7, score: 23.5 });
    expect(body.best).toEqual([{ weekday: 3, startHour: 10 }]);
  });
});

describe("admin", () => {
  it("acceptance: admin endpoints return 401 without a valid token", async () => {
    const calls: [string, () => Promise<Response>][] = [
      ["list (no token)", () => adminList(adminReq("/api/admin/responses", {}, null))],
      ["list (wrong token)", () => adminList(adminReq("/api/admin/responses", {}, "wrong-token-wrong-token"))],
      ["list (token prefix)", () => adminList(adminReq("/api/admin/responses", {}, ADMIN_TOKEN.slice(0, -1)))],
      ["csv", () => adminCsv(adminReq("/api/admin/export.csv", {}, null))],
      [
        "patch poll",
        () =>
          adminPatchPoll(
            adminReq(
              "/api/admin/poll",
              { method: "PATCH", headers: { "content-type": "application/json" }, body: '{"deadlineAt":null}' },
              null,
            ),
          ),
      ],
      [
        "delete",
        () =>
          adminDelete(adminReq("/api/admin/responses/00000000-0000-0000-0000-000000000000", { method: "DELETE" }, null), {
            params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
          }),
      ],
      [
        "forged cookie",
        () =>
          adminList(
            adminReq("/api/admin/responses", { headers: { cookie: `${ADMIN_COOKIE}=9999999999.${"a".repeat(64)}` } }, null),
          ),
      ],
    ];
    for (const [label, call] of calls) {
      const res = await call();
      expect(res.status, label).toBe(401);
    }
  });

  it("accepts a valid session cookie and rejects an expired one", async () => {
    const ok = await adminList(
      adminReq("/api/admin/responses", { headers: { cookie: `${ADMIN_COOKIE}=${await createSessionValue()}` } }, null),
    );
    expect(ok.status).toBe(200);
    const expired = await createSessionValue(Date.now() - 13 * 3600 * 1000);
    const res = await adminList(
      adminReq("/api/admin/responses", { headers: { cookie: `${ADMIN_COOKIE}=${expired}` } }, null),
    );
    expect(res.status).toBe(401);
  });

  it("acceptance: the API ranking matches the hand-computed seed example", async () => {
    await pg.exec(buildSeedSql());
    const res = await adminList(adminReq("/api/admin/responses"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalRespondents).toBe(30);
    expect(
      body.topSlots.map((s: Record<string, number>) => ({
        weekday: s.weekday,
        startHour: s.startHour,
        available: s.available,
        ifNeeded: s.ifNeeded,
        score: s.score,
      })),
    ).toEqual(HAND_COMPUTED_TOP5);
    expect(body.topSlots[0].unavailable).toEqual(["Chantrea Lim", "Imran Sheikh", "Rajesh Karki"]);
    expect(body.responses[0]).toHaveProperty("timezone");
  });

  it("filters by country and organization (case-insensitive)", async () => {
    await pg.exec(buildSeedSql());
    const np = await (await adminList(adminReq("/api/admin/responses?country=NP"))).json();
    expect(np.responses).toHaveLength(7);
    expect(np.responses.every((r: { country: string }) => r.country === "NP")).toBe(true);
    expect(np.totalRespondents).toBe(30);

    const org = await (
      await adminList(adminReq(`/api/admin/responses?organization=${encodeURIComponent("mekong university (DEMO)")}`))
    ).json();
    expect(org.responses.map((r: { name: string }) => r.name).sort()).toEqual(["Dara Pich", "Sokha Chan", "Sreymom Keo"]);
  });

  it("deletes a response", async () => {
    await submit(post("/api/responses", baseSubmission));
    const { rows } = await pg.query<{ id: string }>("select id from response");
    const res = await adminDelete(adminReq(`/api/admin/responses/${rows[0].id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id: rows[0].id }),
    });
    expect(res.status).toBe(200);
    expect(await count("select count(*) n from response")).toBe(0);
    expect(await count("select count(*) n from response_slot")).toBe(0);
  });

  it("exports CSV with formula injection neutralised", async () => {
    await submit(post("/api/responses", { ...baseSubmission, name: "=HYPERLINK(\"x\")" }));
    const res = await adminCsv(adminReq("/api/admin/export.csv"));
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain(`"'=HYPERLINK(""x"")"`);
    expect(text.split("\r\n")[0]).toContain("Tue 10:00 CET/CEST");
  });
});
