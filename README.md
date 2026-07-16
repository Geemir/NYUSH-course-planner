# NYUSH Course Planner

An English-language, four-year academic planning workspace for students across
all NYU Shanghai majors. The planner combines official Bulletin requirements
and course details with prerequisite checks, study-away planning, live degree
progress, feasibility guidance, and portable plan files.

The checked-in last-known-good Bulletin fallback currently contains **810
courses and 43 programs**. A validated database snapshot takes precedence when
one is available.

## Quick start

Requirements: Node.js 20+ and npm. Local development uses embedded PGlite, so a
separate PostgreSQL server is not required.

```powershell
npm install
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To start everything from a
single PowerShell line:

```powershell
npm install; npm run db:push; npm run dev
```

Useful commands:

```powershell
npm test                     # unit and database integration tests
npm run lint                 # ESLint
npx tsc --noEmit             # TypeScript check
npm run build                # optimized production build
npm run bulletin:sync        # fetch, validate, and publish Bulletin data
npm run catalog:generate-fallback
```

## Product experience

- One chronological column covering all eight semesters.
- Sticky course and degree-progress rails on wide screens; accessible sheets
  on tablet and mobile.
- Search and filters across the complete Bulletin catalog, with drag-and-drop
  and keyboard-friendly “Add to semester” actions.
- Major and entry-year selection, prerequisite/load/site warnings, study-away
  controls, requirement progress, and deterministic feasibility guidance.
- First-visit four-step onboarding plus an always-available **Guide** button.
- A New York academic inspiration banner with rotating interest-driven quotes.
- Light/dark themes, responsive dialogs, 44px compact touch targets, reduced
  motion support, and safe-area-aware mobile actions.
- Signed-out plans persist locally. Signed-in NYU users receive database-backed
  plan synchronization. JSON import/export remains available in both modes.

## Official Bulletin data

The source of truth is the official
[NYU Shanghai Undergraduate Bulletin](https://bulletins.nyu.edu/undergraduate/shanghai/).
The synchronization pipeline:

1. Discovers Shanghai major, minor, Core, and subject pages.
2. Archives source documents and parses program requirements, course details,
   descriptions, credits, attributes, and source provenance.
3. Normalizes references while preserving unresolved official references for
   audit instead of fabricating courses.
4. Validates the complete candidate snapshot with fail-closed coverage and
   referential-integrity checks.
5. Atomically activates the immutable snapshot only after validation succeeds.

Official Bulletin content is trusted first-party data and publishes
automatically after validation. A failed fetch, parse, validation, or activation
leaves the prior active snapshot untouched. Re-running an unchanged source is a
no-op based on its content hash.

```powershell
npm run bulletin:sync
```

After a successful production sync, refresh and verify the disaster-recovery
fallback from the same active snapshot:

```powershell
npm run catalog:generate-fallback
npm test -- src/lib/data.test.ts
```

Future user-submitted corrections and additions should use reviewed overlays:
request, review, approve, then apply on top of the official snapshot. They must
not silently rewrite archived Bulletin data.

## Accounts, database, and environment

Without `DATABASE_URL`, development uses PGlite in `.pglite/`. Production uses
PostgreSQL through Drizzle ORM. Create `.env.local` as needed:

```dotenv
AUTH_SECRET=replace-with-a-random-secret
ADMIN_EMAILS=admin@nyu.edu

# Production database
# DATABASE_URL=postgresql://user:password@host:5432/database

# Optional production OAuth providers
# AUTH_MICROSOFT_ENTRA_ID_ID=...
# AUTH_MICROSOFT_ENTRA_ID_SECRET=...
# AUTH_MICROSOFT_ENTRA_ID_ISSUER=...
# AUTH_GOOGLE_ID=...
# AUTH_GOOGLE_SECRET=...

# Optional legacy AI-assisted admin import/rule authoring
# DEEPSEEK_API_KEY=...
```

Local sign-in uses a development-only magic link printed in the server console.
Only `@nyu.edu` addresses are accepted. In production, configure Microsoft Entra
ID or Google OAuth and a hosted PostgreSQL database.

PGlite is single-process. Do not run database scripts against the same local
`.pglite/` directory while `npm run dev` is using it. Production PostgreSQL does
not have this limitation.

## Production start

Set `DATABASE_URL` and the authentication variables before building:

```powershell
npm install
npm run db:push
npm run build
npm run start
```

The build downloads Geist through `next/font`; the build environment therefore
needs access to Google Fonts. On Node 24, building without `DATABASE_URL` may
also print known PGlite worker noise after successful route generation. The
production PostgreSQL path is the supported clean build path.

## Architecture

- **Framework:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4,
  Base UI/shadcn components, dnd-kit.
- **State:** Zustand stores raw planning facts and local persistence; derived
  progress and validation stay outside the persisted state.
- **Data:** Drizzle ORM over PostgreSQL/PGlite, immutable Bulletin snapshots,
  transactional activation, and a generated JSON fallback.
- **Deterministic engines:** allocation, prerequisites, validation, requirement
  progress, special rules, and feasibility live in `src/lib/` and are covered by
  unit/integration tests.
- **API:** `/api/catalog`, `/api/plan`, authentication routes, and admin-only
  Bulletin status/sync and correction-authoring utilities.

The older Albert/FOSE and AI-assisted paste importers remain admin utilities but
are not the primary catalog or program-requirement source.

## Verification

Before merging changes, run:

```powershell
npm test -- --maxWorkers=1
npm run lint
npx tsc --noEmit
$env:DATABASE_URL='postgresql://planner:planner@127.0.0.1:5432/planner_build'
npm run build
```

The temporary build URL only selects the clean node-postgres code path during
static generation; the current routes do not connect to it while building.
