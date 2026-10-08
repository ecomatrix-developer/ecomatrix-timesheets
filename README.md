# Timesheet Recorder — v2 (Next.js + Supabase)

A complete rewrite of the v1 Flask + MongoDB timesheet application as a
Next.js 14 (App Router) + TypeScript + Tailwind CSS + Framer Motion +
Supabase app, with a glassmorphism visual design. It connects to the same
already-migrated Supabase project that holds the real production data
(12 users, 160 projects, ~5,600 timesheet entries, ~2,000 submitted days).

v1 (`../app.py` + friends) is untouched. This app lives entirely under
`v2-nextjs/` as a sibling of the original project.

## Running it

```bash
cd v2-nextjs
npm install
npm run dev
```

Then open http://localhost:3000 — you'll be redirected to `/login`.
Log in with any real migrated username/password (e.g. an employee's Gmail
address as username, or `admin`). Passwords are the same ones already
bcrypt-hashed in Supabase from the MongoDB migration; this app does not
know or reset them.

To verify a production build compiles cleanly:

```bash
npm run build
npm run start
```

## Environment variables (`.env.local`)

`.env.local` is already checked in with real, working values for the
Supabase connection so the app runs out of the box:

| Variable | Status | Notes |
|---|---|---|
| `SUPABASE_URL` | ✅ real value | Copied from `../migration/.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ real value | Copied from `../migration/.env`. **Server-only** — read exclusively inside Server Actions/Route Handlers via `src/lib/supabaseAdmin.ts`, never sent to the browser. |
| `SESSION_SECRET` | ✅ pre-generated random value | Signs the session JWT cookie. Rotate before any shared/production deployment (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). |
| `EMAIL_USER` / `EMAIL_PASSWORD` | ⚠️ placeholder — **you must fill these in** | Gmail address + Gmail **App Password** (not your normal password) for nodemailer/SMTP. Leave blank to disable emailing; PDF generation and download still work without it. |
| `ADMIN_EMAIL` / `OWNER_EMAIL` | ⚠️ placeholder — **you must fill these in** | Recipients for the weekly backup and owner snapshot report emails. |

Never commit real secrets from this file anywhere public — it's already
excluded via `.gitignore`.

## Architecture

- **All Supabase access happens server-side** via `src/lib/supabaseAdmin.ts`,
  which uses the service-role key. Every page component, Server Action
  (`src/app/(actions)/*.ts`), and Route Handler (`src/app/api/**/route.ts`)
  reads/writes Supabase directly — there is no client-side Supabase call and
  the service role key never reaches the browser bundle.
- **Auth/session**: a signed JWT (via `jose`) is stored in an httpOnly,
  `SameSite=Lax` cookie (`src/lib/session.ts`). Login verifies the submitted
  password against `users.password_hash` with `bcryptjs`. `requireSession()`
  / `requireAdmin()` gate every Server Action and admin page; `middleware.ts`
  adds a lightweight edge-level redirect for defense-in-depth (it only checks
  cookie presence — the actual JWT verification and role check happen
  server-side on every request).
- **Timesheet grid** (`src/components/TimesheetGrid.tsx`) is a single shared
  component reused by the employee's own editable `/timesheet`, the
  admin's read-only `/admin/timesheet_view/[username]`, and the detailed
  grid embedded in `/reports` — exactly mirroring how v1's Jinja templates
  shared the same conceptual grid across those three v1 routes.
- **Business rules** (`src/lib/timesheetMath.ts`, `src/lib/constants.ts`,
  `src/lib/dateUtils.ts`) are implemented as pure functions with the same
  semantics as `app.py`'s live code (lines ~1669–3058):
  - Weekday submission requires ≥ 7.75 total hours (excluding the
    `Overtime Logged` category); weekends have no minimum.
  - Overtime = all weekend hours, plus any weekday hours above 7.75.
  - PTO total = `PTO` + `PTO BANKING` categories only.
  - All 13 real-world categories are included (8 from `app.py`'s
    `TIMESHEET_DATA` plus the 5 discovered during migration — see
    `supabase_patch_1_add_categories.sql`), and `Overtime Logged` is
    filtered out of every editable/read-only grid, exactly like v1.
- **PDF generation**: `@react-pdf/renderer` (see "PDF library choice" below).
- **Charts**: `recharts` for the Insights page (bar: hours/project, pie:
  hours/employee), replacing v1's Plotly.
- **Email**: `nodemailer` over Gmail SMTP (`smtp.gmail.com:587`), same
  transport v1 used via Python's `smtplib`.

## PDF library choice: `@react-pdf/renderer`

v1 used WeasyPrint (HTML → PDF), which requires native GTK/Pango/Cairo
system libraries and is a poor fit for serverless/Node deployment targets
(Vercel, etc.) where you can't easily install system packages. Headless-
Chromium approaches (Puppeteer/Playwright) work but are heavy, slow to cold
-start, and fragile in serverless environments (large binary, sandboxing
issues, memory limits). `@react-pdf/renderer` renders PDFs directly from
React components with its own layout engine — no native dependencies, no
headless browser, works identically in `next dev`, `next build`/`next start`,
and standard Node serverless functions. The tradeoff is a simpler flexbox-like
layout model instead of full CSS/HTML, which is why the PDF documents
(`src/lib/pdf/WeeklyEmployeeReport.tsx`, `src/lib/pdf/OwnerSnapshotReport.tsx`)
are built with React-PDF's `View`/`Text`/`StyleSheet` primitives rather than
reusing the app's Tailwind HTML markup. The owner's snapshot's dashboard
numbers (billable vs non-billable hours, top-5 projects) are rendered as text
summaries rather than embedded chart images (v1 rendered Plotly-to-PNG via
kaleido for this) — recreating that exact chart-to-raster pipeline was judged
not worth the added native-dependency risk for a report that's primarily
about the numbers and compliance/red-flag callouts.

## Pages / routes implemented (parity checklist)

| # | v1 | v2 |
|---|---|---|
| 1 | `/login` | `/login` — bcrypt-verified against `users.password_hash` |
| 2 | `/dashboard` | `/dashboard` — animated status-count stat cards |
| 3 | `/projects` | `/projects` — status multi-select + text search (admin only) |
| 4 | `/projects/create`, `/projects/<id>/edit` | `/projects/create`, `/projects/[id]/edit` |
| 5 | `/projects/<id>/delete` (GET, bug) | `deleteProjectAction` Server Action invoked from a button — **POST, not GET** |
| 6 | `/timesheet` | `/timesheet` — monthly grid, autosave, submit-day locking |
| 7 | `/admin/timesheet_view/<username>` (broken) | `/admin/timesheet_view/[username]` — **`dates_in_month` NameError fixed** |
| 8 | `/reports` | `/reports` — submission log, project totals, PTO/overtime summary, shared grid |
| 9 | `/insights` | `/insights` — recharts bar + pie |
| 10 | `/timesheet/reopen/<employee>/<id>` | `reopenDayAction` Server Action (admin only) |
| 11 | `/create_employee` | `/create_employee` — bcrypt-hashes new passwords |
| 12 | `/delete_employee/<username>` | `deleteEmployeeAction` Server Action, `admin` user protected |
| 13 | `/delete_old_entries` (no confirm) | `/delete_old_entries` — **confirmation modal added** |
| 14 | `/database_stats` (Mongo 512 MB framing) | `/database_stats` — row counts per table; Postgres/Supabase-appropriate messaging instead of the old 512 MB Mongo figure |
| 15 | `/export/csv` | `/api/export/csv` — same columns, same admin-vs-own-rows scoping |
| 16 | `/run-backup-now`, `/run-owner-report-now` (**no auth**) | `/api/reports/run-backup`, `/api/reports/run-owner-report` — **admin-session required**, triggered from a panel on `/reports` |

## Intentional behavior differences from v1 (bug fixes)

These are deliberate, documented deviations — not oversights:

1. **`dates_in_month` NameError fixed.** v1's `/admin/timesheet_view/<username>`
   referenced an undefined variable (`app.py:1938`) and crashed on every
   request. v2's equivalent page computes its date range once, correctly.
2. **Project status is a fixed lowercase `<select>`**, not free text — v1
   let `create`/`edit` default to `'Active'` (capitalized) while every
   other comparison in the app used lowercase, causing silent mismatches.
3. **Project delete is a real mutation (Server Action / POST), not a GET
   link.** v1's `/projects/<id>/delete` was a plain `GET` route, reachable
   by prefetch, crawlers, or a stray `<a>` tag.
4. **Passwords are bcrypt-hashed, never plaintext** — true both for the
   already-migrated data and for any new employee created through
   `/create_employee` in v2 (v1 stored and compared plaintext passwords).
5. **No hardcoded session secret.** v1 had `app.secret_key =
   'your-secret-key-here'` committed in source. v2 reads `SESSION_SECRET`
   from `.env.local` and refuses to start signing sessions without one long
   enough to be meaningful.
6. **PDF/report trigger routes require an authenticated admin session.**
   v1's `/run-backup-now` and `/run-owner-report-now` had **no auth check at
   all** — any anonymous visitor could trigger PDF generation and outbound
   email to real staff. v2's `/api/reports/run-backup` and
   `/api/reports/run-owner-report` return `401`/`403` without an admin
   session, and the only UI entry point is a button on the admin-only
   `/reports` page.
7. **Delete Old Entries requires an explicit confirmation step.** v1's
   `/delete_old_entries` executed immediately on POST; v2 shows a modal
   naming exactly what will be destroyed before calling the Server Action.
8. **All 13 real-world categories are preserved**, including the 5
   discovered only in production data during migration (`Special Vacation`,
   `Special Vacation Banking`, `Research Initiatives`, `Training`,
   `empty_0`) — none are silently dropped.
9. **`project_id` vs `category` is a real, enforced split** (two nullable
   columns with a `CHECK` constraint, per `supabase_schema.sql`), instead of
   v1's single string field that meant "real project" or "special category"
   depending on whether it happened to match an ObjectId — eliminating a
   whole class of stringly-typed bugs from v1.

## Known simplifications / non-goals

- **`submitted_weeks`** exists in the schema for parity but has no UI in v2,
  matching the fact that it holds 0 rows in the real production data (v1's
  weekly-submission flow was already dead code in practice — see
  `context.md` §3 and §9.11).
- **Database Stats** reports row counts per table rather than an exact
  on-disk byte size, because Postgres's `pg_database_size()` isn't exposed
  through the Supabase JS client with the credentials this app uses; check
  the Supabase dashboard's Usage page for exact storage figures.
- **The owner's PDF snapshot** presents billable/non-billable and top-5-
  project figures as text/tables rather than embedded chart images (see the
  PDF library rationale above).
- **No automated scheduler** is wired up (v1's was fully commented out too —
  see `context.md` §7). The two report routes are meant to be triggered
  either manually from `/reports` or by an external cron/scheduled job
  hitting `/api/reports/run-backup` and `/api/reports/run-owner-report` with
  a valid admin session cookie.

## Tech stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Framer Motion ·
`@supabase/supabase-js` · `bcryptjs` · `jose` · `@react-pdf/renderer` ·
`nodemailer` · `recharts` · `date-fns`
