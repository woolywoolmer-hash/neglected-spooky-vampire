# Fieldwork — facilities booking V1

A responsive school and sports-centre booking application built with Next.js, React and TypeScript. The weekly operational calendar is the starting screen. All sample organisations, contacts, and bookings are fictional.

## Review in a private browser workspace

[Open this repository in GitHub Codespaces](https://codespaces.new/woolywoolmer-hash/neglected-spooky-vampire?ref=main).

1. Sign in to GitHub and create a Codespace from **main**. The included development container installs Node.js dependencies, builds V1, and starts the demo automatically. No Supabase configuration is needed.
2. Open the **Ports** tab, find **3000 — Fieldwork demo**, and choose **Open in Browser** if the browser tab did not open automatically. Keep the port visibility **Private** (the Codespaces default); access then requires your GitHub sign-in. There is no public deployment.
3. The application itself needs **no demo email or password**. It opens as **Alex Morgan — Administrator**. Use the **Demo role** selector at the top right to try manager, school staff, or read-only permissions.

The launcher explicitly selects demo mode and creates only fictional test data in `.data/browser-demo-3000`, separate from Supabase. Demo changes persist inside that Codespace. You can create/edit a booking, test Astro conflicts, and export reports. If you stop/restart the Codespace, its startup command restarts the demo. Stop the Codespace in GitHub when you finish your review.

If the automatic startup needs retrying, run `bash .devcontainer/start-demo.sh` in its terminal. It checks readiness and reuses an existing demo server. Startup logs are in `.data/browser-demo-3000.log`. Creating or opening your Codespace is a user action in GitHub; a server running inside the Codex cloud environment is not automatically accessible from your own browser.

## Run locally

Use Node.js 24 and npm (the lockfile is included).

```sh
npm ci
npm run dev
```

No credentials are needed for the **local demo**. The first data request initializes a persistent embedded PostgreSQL database with PGlite under `.data/fieldwork`. The UI labels demo mode and offers four demo roles so you can exercise permissions. This role switch is deliberately available only in demo mode; it is not authentication. Do not put real customer data in the demo or expose it publicly.

The database auto-seeds 7 bookable resources, 9 rate records, 4 fictional customers, 20 sample bookings around the first-start week, and 2 closures. Subsequent starts preserve edits. `npm run db:seed` initializes the database without replacing existing records; stop the application before running it. PGlite is a **single-process local demo**, not a multi-instance hosted database. `DEMO_DATABASE_PATH` optionally changes its local location. To reset a disposable demo, stop the server and remove only that demo's `.data` directory.

```sh
npm test                 # engine, real PostgreSQL and reporting tests
npm run typecheck
npm run build
# Private production-mode demo only:
ALLOW_DEMO=true npm run start
```

The production build refuses database requests unless Supabase is configured or `ALLOW_DEMO=true` is explicitly set. No hosted service is needed to build.

## Browser tests

Run `npm run build` and then `npm run test:e2e`. Playwright starts a production-mode private demo on port 3001 with a separate `.data/e2e-<run timestamp>` database. It uses `/usr/bin/chromium` in this cloud machine. Elsewhere set `CHROMIUM_PATH` to a Chromium binary, or install Chromium with Playwright and update `playwright.config.ts`. `E2E_BASE_URL` uses an already-running disposable demo instead. Browser tests create fictional records; use a disposable database. Core rule tests use fresh in-memory PostgreSQL databases.

## Supabase deployment

1. Create a Supabase project and run `supabase/migrations/001_core.sql`, then `002_supabase_auth.sql`, followed by `supabase/seed.sql` using its SQL editor or migration tooling. The auth migration is intended to run once. Hosted seed data contains facilities, rates, and synthetic customer accounts, but **no sample bookings**.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the deployment's environment (see `.env.example`). For local hosted testing, put them in an untracked `.env.local`. Both values are required together. No service-role key is used.
3. Provision confirmed team members with passwords through trusted Supabase administration. V1 provides password sign-in; invitation acceptance/password-reset screens are not implemented. Newly created profiles default to `readonly`; role claims never come from client-editable metadata. Bootstrap the first administrator in the trusted SQL editor:

   ```sql
   update public.profiles set role = 'administrator'
   where id = '<auth user UUID>';
   ```

   Assign `manager`, `staff`, or `readonly` similarly. Account provisioning and role administration are currently trusted Supabase-console operations, not a public signup screen.

4. Deploy as a Node.js Next.js application with `npm run build` / `npm run start`, or a compatible Next.js host. Keep `ALLOW_DEMO` unset. Sign in on `/login` using a provisioned user's email/password. API requests validate the user with Supabase, refresh session cookies, and retrieve the server-controlled profile role.
5. Verify sign-in, the four role boundaries, booking creation/conflicts, persistence, and reporting against that project before using real data. Apply your organisation's backup and retention policies there.

No live Supabase project credentials were supplied for development. Hosted authentication therefore requires this deployment verification; the test suite validates the PostgreSQL/RLS/RPC policy using simulated Supabase auth roles, not a live Auth service.

## What V1 includes

- Day, week, month and year views; facility filters; clickable time grid and booking cards; a 24-hour toggle for time-grid views. Dates and inputs use Europe/London, with UTC timestamps in storage.
- Actual start/end timestamps with five-minute precision, default 60 minutes, multi-day bookings, and proportional charging in integer pence.
- Jowett Sports Hall; Astro A, B and Full; two extensible squash courts; Westfield with optional child resources. Additional coaching, netball and tennis pricing records are ready to link to future resources.
- Customer records, contact/billing details, agreed percentage discounts, active status and booking history.
- All six booking statuses, five booking types, payment statuses, attendees, notes, access fields and creation/modification details.
- Daily, weekly, selected weekdays, fortnightly, monthly and custom every-N-days recurrence. Use an inclusive end date or occurrence count, up to 366 occurrences. Monthly recurrence skips nonexistent month dates (e.g. a 31st); UK wall-clock time is preserved across DST. Nonexistent DST-gap times are rejected. Edit/cancel individual occurrences; bulk series changes are not implemented.
- Database-enforced timestamp conflicts, including both Astro halves, facility hierarchy and closure periods. Recurring batches are all-or-nothing. Adjacent bookings are allowed unless reservation buffers overlap. Enquiries and cancellations do not reserve time; provisional and approval-pending requests do.
- Three separate windows: customer booking, buffered facility reservation, and access validity. Access periods do not reserve or increase charges. Jowett access starts 10 minutes early. Changes to facility timing apply to new reservations; existing reservations retain snapshots.
- Administrator-managed pricing, facility settings and closures. Administrators can deliberately override price or booking conflicts only with an audit reason. Closures require conflicting bookings to be moved/cancelled first. Facility hierarchy changes are conservatively blocked if affected upcoming schedules would need reconciliation.
- Role enforcement in both API and database: administrator full management; manager bookings/customers; staff their own internal requests/cancellations; readonly availability. Staff/readonly do not receive the customer directory or audit records; other users' contact/access details are redacted. Staff retain private details of their own requests.
- Dashboard with today's/upcoming bookings, live availability, provisional/approval counts, unpaid bookings and closures. Reports by facility/customer, utilisation, external hire value, VAT, cancellations, internal/external use and outstanding payment statuses; CSV export with spreadsheet-formula escaping.
- Append-only application audit records with actor/time, old/new values and reasons. UI exposes the latest 500 audit entries; the database retains all entries. Optimistic modification timestamps protect against stale edits.

## Important financial definitions

The supplied rates are preserved **exactly**, including independent ex-VAT, VAT and gross values that do not add up (for example Jowett £36.70 + £7.34 versus the requested £44.00 total). The pricing screen flags discrepancies; confirm the intended schedule before live billing. Each component is prorated/discounted independently. Zero-rated School, Complimentary and Maintenance bookings are supported, as are explicit administrator price overrides. Westfield has no invented tariff: external hire there requires a price override until a rate is configured. Existing booking prices are snapshots; commercial changes (time/resource/customer/type) recalculate them.

Reports measure confirmed/completed **booking value**, not recognised revenue or payments received. Booking financial/count date filters use London start dates. Utilisation uses 07:00–22:00 as an explicitly disclosed comparison window, regardless of the calendar's 24-hour display; overlapping intervals are unioned and Astro physical halves are counted once. Buffers/closures are excluded from occupied hours, while denominator capacity uses current facilities. Payment tracking is status-based in V1; part-paid bookings are flagged for reconciliation because no amount-paid ledger or payment provider has been implemented.

## Architecture

- `src/lib/types.ts`: shared application contract.
- `src/lib/booking-engine.ts`: pure validation, recurrence, pricing and conflict preview.
- `src/lib/db.ts`: local PostgreSQL / authenticated Supabase adapter.
- `supabase/migrations/001_core.sql`: database checks, serialization guard, scheduling triggers, atomic mutations, prices, audit, protected snapshots.
- `supabase/migrations/002_supabase_auth.sql`: profiles, RLS, authenticated RPCs; direct client table writes are denied.
- `src/app/api`: authenticated commands; server calculations and validation; same-origin cookie mutations.
- `src/components`: calendar/editor, customer management, dashboard, settings and reports.
- `src/lib/integrations.ts`: typed ports for future providers. iSAMS, SOCS, payments, email, calendars, access control and accounting are **not connected**. Integration delivery/retries and a durable outbox belong in a future implementation.

The V1 persistence contract uses JSONB documents behind PostgreSQL tables, indexes, validation functions and transactions. Both adapters run the same core SQL. On hosted PostgreSQL a scheduling guard serializes resource-changing writes across concurrent requests, avoiding full/half-pitch races; unique tariff indexes enforce one current rate per resource. Evolve the schema through versioned SQL migrations as query volume grows. Existing application migrations should not be rerun as an upgrade strategy in a live database.

The next development step is to configure a staging Supabase project, verify real sign-in and deployment, reconcile the supplied financial schedule, then add an amount-paid ledger and any chosen integration as separate work. Nothing in this repository automatically publishes or deploys the application.
