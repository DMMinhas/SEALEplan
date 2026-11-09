# Weekly Proposal Meeting – Availability

A small availability poll for the **SEALE CBHE Proposal Consortium (Pakistan–Nepal–Cambodia)**. Participants open one public link, mark the weekly one-hour slots they can attend, and submit. The coordinator uses a secret admin link to find the best recurring slot.

- `/`: participant form and slot grid (Berlin time plus the participant's local time)
- `/results`: public heatmap with respondent counts by country (no names)
- `/admin?token=…`: coordinator view (ranking, per-person table, filters, deadline, delete, CSV, "who hasn't responded")

**Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS 4, Zod, Luxon, Supabase Postgres (accessed server-side only via `postgres.js`), deployed on Vercel.

---

## How time zones work

- **Slots are stored as (ISO weekday, start hour) in Europe/Berlin wall-clock time.** They are never stored as UTC. A "Tue 10:00" slot means 10:00 in Berlin all year: CET (UTC+1) in winter and CEST (UTC+2) in summer.
- Pakistan, Nepal and Cambodia don't change their clocks, so their local time for a slot depends on the date. The app converts each slot for a concrete week: the current week, or the next Monday if today is a weekend. It builds the instant in `Europe/Berlin` and converts it with the IANA database (Luxon/Intl). Nothing is hard-coded, which is why Nepal's +05:45 comes out right.
- If participants' local times shift within the next 26 weeks (Berlin moves to summer time on **28 Mar 2027**), the form and the confirmation screen show a notice and both times. For example, Tue 10:00 CET is 14:45 in Kathmandu now and 13:45 from 29 Mar 2027.
- The grid is defined in [`src/config/poll.config.ts`](src/config/poll.config.ts): days, start hour, end hour and slot length (whole hours). The title, subtitle, privacy contact and rate limit are also set there.

---

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com). Choose an EU region, e.g. *Central EU (Frankfurt)*.
2. Open **SQL Editor**, paste [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and run it. This creates the tables, enables row-level security with **no policies**, and revokes access from the public `anon`/`authenticated` roles. The browser cannot reach the data through Supabase's public API.
3. Optional, for test data: paste [`supabase/seed.sql`](supabase/seed.sql) and run it. It adds 30 fictional respondents across DE/PK/NP/KH. To remove them later: `delete from response where edit_token_hash = 'seed';`
4. Click **Connect**, choose **Transaction pooler** (port 6543) and copy the connection string. Replace `[YOUR-PASSWORD]` with your database password and add `?sslmode=require`. This is your `DATABASE_URL`.

> The app uses the database connection string, not the Supabase service-role key. That lets it run real SQL transactions and lets the tests run against an in-process Postgres. Treat `DATABASE_URL` as just as sensitive as the service-role key.

### 2. Local development

```bash
npm install
cp .env.example .env.local      # fill in DATABASE_URL, ADMIN_TOKEN, APP_SECRET
openssl rand -hex 32            # run twice: once for ADMIN_TOKEN, once for APP_SECRET
npm run dev                     # http://localhost:3000
npm run seed                    # optional: same seed data via DATABASE_URL
```

Without Supabase, a local Postgres in Docker works too:

```bash
docker run -d --name seale-pg -e POSTGRES_PASSWORD=localdev -p 54329:5432 postgres:16-alpine
docker exec -i seale-pg psql -U postgres < supabase/migrations/0001_init.sql
# DATABASE_URL=postgres://postgres:localdev@localhost:54329/postgres
```

### 3. Deploy to Vercel

1. Push this folder to a Git repository and click **Add New → Project** on Vercel, then import it. The framework is detected as Next.js and needs no build settings.
2. Under **Settings → Environment Variables**, add `DATABASE_URL`, `ADMIN_TOKEN` and `APP_SECRET` (Production, and Preview if you use it).
3. Optional: under **Settings → Functions**, set the region to *Frankfurt (fra1)* so it is close to the database.
4. Deploy. Share `https://<your-app>.vercel.app/` with participants and keep `https://<your-app>.vercel.app/admin?token=<ADMIN_TOKEN>` for yourself.

**Before sharing the link:** replace the placeholder `privacy.contactEmail` in `src/config/poll.config.ts`.

---

## Using it

**Participants** fill in their name, organization, country and time zone (detected from the browser and editable), then click or drag across the grid. On phones the grid becomes a day-by-day list. On the keyboard, arrow keys move between cells, Enter or Space applies the selected option, and `1` / `2` / `0` mark Available / If needed / Unavailable.

**Editing:** the browser keeps a random edit key in `localStorage`, so reopening the page loads the earlier answer. On another device, entering the same name and organization overwrites the earlier answer. Matching ignores case and extra spaces. Earlier answers are only *pre-filled* with the browser's edit key, so nobody can look up a colleague's answers by typing their name.

**Coordinator** (admin link):

- The link swaps the token for a 12-hour httpOnly session cookie and removes the token from the URL.
- **Deadline:** entered in Berlin time. After it passes, the form is read-only and the API rejects submissions (HTTP 403).
- **Top 5 slots:** score = Available × 1 + If needed × 0.5. Ties go to the slot with more "Available" answers, then to the earlier slot. Each slot lists who cannot attend.
- **Filters** by country and organization apply to the table, the ranking and the CSV export.
- **"Who has not responded yet?":** paste one name per line. The comparison runs in your browser.

---

## Security & privacy

- Collects only name, organization, country, time zone and slot choices. No email, no login, no analytics, no third-party fonts or scripts (a strict CSP is set in `next.config.ts`).
- All database access is server-side, in Route Handlers and Server Components. Modules that touch the database import `server-only`. Every value is a bind parameter (`$1…$n`).
- Every input is validated server-side with Zod: strict objects, known ISO country codes, valid IANA zones, and slots inside the configured grid.
- The admin token is checked by comparing SHA-256 digests in constant time. The token is never logged. Every admin API route returns **401** without a valid cookie or `Authorization: Bearer <ADMIN_TOKEN>`.
  - Vercel's own request log may still record the first `/admin?token=…` URL. Rotate `ADMIN_TOKEN` if the link leaks; that also invalidates existing sessions.
- The submit endpoint is rate-limited to 10 per 10 minutes per IP. Limits are kept in Postgres and store only an HMAC of the IP. A hidden honeypot field silently discards bot submissions.
- The public `/api/results` is built only from aggregate queries. It never contains names, organizations or time zones (tested).
- CSV export guards against spreadsheet formula injection.

---

## Tests

```bash
npm test          # Vitest – 43 tests, no database or Docker needed (uses PGlite)
npm run typecheck
npm run lint
```

The API tests run the real Route Handlers against **PGlite** (Postgres compiled to WebAssembly) with the real migration applied. The acceptance tests cover:

| Requirement | Test |
|---|---|
| Tue 10:00 Berlin → 14:00 Karachi, 14:45 Kathmandu, 16:00 Phnom Penh in winter; each 1 h earlier after 28 Mar 2027 | `tests/time.test.ts` |
| Same name + organization with different case and spacing overwrites, no duplicate | `tests/api.test.ts` |
| Submissions after the deadline are rejected server-side | `tests/api.test.ts` |
| Public results never return names or time zones | `tests/api.test.ts` |
| Admin endpoints return 401 without a valid token | `tests/api.test.ts` |
| Weighted ranking matches a hand-computed example from the seed | `tests/ranking.test.ts`, `tests/api.test.ts` (hand calculation in `tests/helpers/expected.ts`) |

The seed's expected top 5: **Wed 10:00 (23.5)**, Tue 10:00 (23.0), Wed 09:00 (20.0), Tue 09:00 (19.5), Thu 10:00 (18.5).

`npm run seed:sql` regenerates `supabase/seed.sql` from `seed/respondents.ts`.

---

## Project layout

```
src/config/poll.config.ts    all editable settings (title, grid, privacy contact, rate limit)
src/lib/time.ts              Berlin ↔ local conversion, DST look-ahead
src/lib/grid.ts              slot grid built from config
src/lib/repo.ts              SQL (upsert in a transaction, aggregates, admin queries)
src/lib/schemas.ts           Zod input validation
src/lib/admin-auth.ts        token check + signed session cookie
src/middleware.ts            /admin?token=… → cookie + clean redirect
src/app/api/**               Route Handlers
src/components/**            form, grid, combobox, results, admin dashboard
supabase/migrations/         schema
seed/                        fictional respondents + seed SQL builder
tests/                       Vitest suites
```

If you change the grid in the config after responses exist, slots outside the new grid are ignored when displaying results; their rows are kept in the database.
