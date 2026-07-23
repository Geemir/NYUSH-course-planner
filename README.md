# NYUSH Course Planner v0.2

An English-language four-year degree planner for students enrolled at NYU Shanghai. It combines NYU Shanghai Bulletin requirements with a query-driven catalog of New York undergraduate courses for study-away exploration.

This is not an official NYU degree audit, petition, advisor approval, registration authorization, or availability service. New York degree programs are not selectable, and a New York course affects NYUSH progress only through an active NYUSH requirement or reviewed planner overlay.

## What is in v0.2

- One-column, eight-semester planner with drag, keyboard assignment, variable credits, Undo/Redo, local-first persistence, visible sync state, revision conflicts, and v1 plan migration backups.
- Program Profile with NYUSH Core, one primary major, an optional distinct second major, and multiple NYUSH minors.
- Query-driven catalog search, stable pagination, school/subject/campus filters, release-aware details, and hydration of placed courses.
- Immutable source snapshots and composed releases for NYU Shanghai plus 13 New York school inventories, with last-known-good retention and fail-closed validation.
- Correction Hub with student reports, My Reports, maintainer review, messages, notifications, immutable audit events, and typed overlays. Approval and application are separate actions.
- NYU Academic Glass: NYU violet identity, legal platform font stack, Lucide icons, touch-safe controls, restrained functional glass, responsive preferences, English onboarding, Help, interest quotes, and the provided New York skyline.

The checked-in recovery catalog contains 810 NYUSH courses and 43 programs. The full New York catalog is database-backed and must be synchronized before use.

## Requirements

- Node.js 20 or newer (verified locally with Node 24)
- npm 10 or newer
- Embedded PGlite for single-process local development, or PostgreSQL for shared/staging/production use

## Quick start: local development

**Fastest (one command):** after `npm.cmd install` and copying `.env.local`,
`npm.cmd run dev:full` applies the schema, seeds the catalog if empty, fills the
New York study-away catalog, verifies it, then starts the dev server — in the
right order for single-process PGlite. Flags: `-- --fresh` (rebuild the local DB
from scratch), `-- --no-ny` (NYUSH only), `-- --port 3000`.

Or step by step:

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run db:push
npm.cmd run bulletin:sync
npm.cmd run dev
```

> **PGlite is single-process.** Never run a database script (`db:seed`,
> `fill-ny-catalog`, `resync-source`, `dev:full`) while `npm run dev` is up — it
> corrupts the local database. Those scripts now detect a running server and
> refuse; `npm run catalog:status` prints the current catalog health.

Open [http://localhost:3000](http://localhost:3000). `db:push` is for a disposable local database only. Teams using a shared or migration-managed database must review and apply the ordered SQL migrations in `drizzle/` instead.

To start without a live Bulletin refresh, omit `bulletin:sync`; the checked-in NYUSH recovery catalog will remain available, but the 13-source New York GA claim will not be satisfied.

## Production-like verification

```powershell
npm.cmd install
npm.cmd test -- --maxWorkers=1
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run start
```

Production-build browser verification uses an isolated PGlite database and never adds an authentication bypass:

```powershell
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Release-specific checks:

```powershell
$env:PGLITE_DIR='.pglite-staging'
npm.cmd run verify:v0.2:sources -- --json

$env:ALLOW_DESTRUCTIVE_MIGRATION_REHEARSAL='true'
$env:MIGRATION_REHEARSAL_TARGET='pglite://memory/v0-2-rehearsal'
npm.cmd run verify:v0.2:migration
```

The source verifier is read-only. The migration rehearsal refuses targets that are not explicitly marked disposable or appear production-like.

## Bulletin synchronization

Degree requirements come only from the [NYU Shanghai Undergraduate Bulletin](https://bulletins.nyu.edu/undergraduate/shanghai/). Study-away inventory comes from the 13 configured school sections under the [NYU Undergraduate Bulletin](https://bulletins.nyu.edu/undergraduate/).

```powershell
npm.cmd run bulletin:sync
npm.cmd run bulletin:sync -- --source=nyu-new-york-arts-science
npm.cmd run bulletin:sync -- --source=nyu-new-york-business --source=nyu-new-york-engineering
```

The pipeline discovers only configured school boundaries, archives canonical documents, normalizes course provenance, excludes graduate records, quarantines ambiguity, validates counts/references/hosts, and activates a composed release atomically. A failed or anomalous refresh leaves the previous healthy source membership active.

Bulletin records are catalog inventory. They do not confirm a current semester offering, open seats, instructor, registration eligibility, prerequisite clearance, or NYUSH fulfillment. Albert and live scheduling integration remain out of scope for v0.2.

## Accounts, privacy, and administration

Copy `.env.example` to `.env.local`, replace `AUTH_SECRET`, and configure OAuth variables for production. Development may use the console-only magic link; production providers never include it. Sign-in is restricted to `@nyu.edu` identities.

`ADMIN_EMAILS` is a comma-separated allowlist; a stored `admin` role is also honored server-side. Every plan, report, message, and notification route scopes reads to its owner. Correction Hub private notes remain administrator-only, and maintainer decisions are planner-side guidance rather than official NYU action.

Do not include real secrets or production hosts in `.env.example`, logs, release reports, screenshots, or test fixtures. PGlite is single-process: stop the development server before another command opens the same directory.

## Design and attribution

The interface uses `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, Helvetica, Arial, and standards-based fallbacks; no proprietary Apple font or copied SF Symbol is distributed. Lucide is the icon family, while NYU violet/plum/lavender remain the brand anchors. Dense academic surfaces are opaque; blur is limited to functional floating/transient chrome and falls back for reduced transparency, contrast, forced colors, and unsupported browsers.

The skyline photograph is by Diane Picchiottino, supplied from [Unsplash](https://unsplash.com/) as `diane-picchiottino-EZ_SHxykcgw-unsplash.jpg`, and stored as `public/nyc-skyline-diane-picchiottino.jpg`.

## Architecture

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Base UI/shadcn, dnd-kit, Zustand
- Drizzle ORM over PostgreSQL/PGlite, immutable Bulletin captures/snapshots, composed releases, and reviewed overlays
- Public bounded catalog APIs; owner-scoped plan/correction/notification APIs; server-authorized administration
- Vitest/PGlite unit and integration coverage plus Playwright/Chromium production-build journeys

Next.js 16 in this repository has version-specific conventions. Read the relevant guide under `node_modules/next/dist/docs/` before changing framework APIs.

## Troubleshooting

- `No active catalog release`: run migrations and `bulletin:sync`, or seed the isolated E2E database only for tests.
- PGlite lock/open errors: stop all processes using the configured `PGLITE_DIR` and retry.
- Auth.js `UntrustedHost`: configure the exact deployment `AUTH_URL`/trusted-host setting; do not add a test login route.
- Playwright cannot find Chromium: run `npx.cmd playwright install chromium` under the same user account.
- A source verifier exits non-zero: inspect its missing/failed/count/level diagnostics; do not publish around the gate.

## Release evidence and rollback

- [v0.2 acceptance matrix](docs/releases/v0.2-acceptance.md)
- [v0.2 verification report](docs/releases/v0.2-verification-report.md)
- [v0.2 rollback runbook](docs/releases/v0.2-rollback.md)

Rollback reactivates a previously complete composed catalog release and restores the prior compatible application build. It never deletes source snapshots, v2 plans, v1 backups, correction events, messages, notifications, or overlays.
