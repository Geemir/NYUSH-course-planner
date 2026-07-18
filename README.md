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
npm run bulletin:sync -- --source=nyu-new-york-arts-science
npm run bulletin:sync -- --source=nyu-new-york-business --source=nyu-new-york-engineering
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
- A New York skyline inspiration banner with session-stable, interest-driven
  quotes and a manual “Another thought” control.
- Contextual course and requirement reporting, **My reports**, maintainer
  review, in-app notifications, and typed reviewed overlays that never rewrite
  archived Bulletin source data.
- Light/dark themes, responsive dialogs, 44px compact touch targets, reduced
  motion/transparency and higher-contrast fallbacks, and safe-area-aware mobile
  actions.
- Signed-out plans persist locally. Signed-in NYU users receive database-backed
  plan synchronization. JSON import/export remains available in both modes.

## Official Bulletin data

Degree requirements come only from the official
[NYU Shanghai Undergraduate Bulletin](https://bulletins.nyu.edu/undergraduate/shanghai/).
Study-away course inventory comes from the configured undergraduate school
sections of the [New York Bulletin](https://bulletins.nyu.edu/undergraduate/).
The synchronization pipeline:

1. Discovers Shanghai major, minor, Core, and subject pages plus course pages
   owned by each configured New York school. New York program pages are never
   imported as NYUSH degree requirements.
2. Archives source documents and parses program requirements, course details,
   descriptions, credits, attributes, and source provenance.
3. Normalizes references while preserving unresolved official references for
   audit instead of fabricating courses.
4. Validates the complete candidate snapshot with fail-closed coverage and
   referential-integrity checks.
5. Activates each immutable source snapshot independently, then atomically
   composes a release from one healthy snapshot per enabled source.

Official Bulletin content is trusted first-party data and publishes
automatically after validation. A failed fetch, parse, validation, or activation
leaves that source's prior healthy snapshot and the current release untouched.
Re-running an unchanged source is a no-op based on its content hash.

New York Bulletin text such as “typically offered” is catalog evidence, not a
promise of semester availability, seats, eligibility, or NYUSH degree
fulfillment. The expanded New York catalog currently requires a database-backed
deployment; the checked-in fallback remains a bounded NYUSH recovery catalog.

```powershell
npm run bulletin:sync
```

After a successful production sync, refresh and verify the disaster-recovery
fallback from the same active snapshot:

```powershell
npm run catalog:generate-fallback
npm test -- src/lib/data.test.ts
```

User-submitted corrections and additions use the reviewed-overlay workflow:
request, review, approve, then apply on top of the official snapshot. Approval
and application are separate maintainer actions. Active overlays carry forward
to new releases, become superseded when the Bulletin resolves them, and block a
release when their target disappears or conflicts instead of being silently
dropped.

## NYU Academic Glass design system

The interface uses the legal platform font stack (`-apple-system`,
`BlinkMacSystemFont`, `Segoe UI`, Helvetica, Arial, sans-serif), Lucide icons,
and NYU violet/plum/lavender semantic tokens. Apple-inspired craft is limited
to restrained motion, careful hierarchy, and functional glass on floating or
transient chrome. Semester cards, course rows, forms, evidence, and long-reading
surfaces remain opaque.

The glass primitive has an opaque default, uses `backdrop-filter` only when the
browser supports it, and turns blur off for reduced-transparency preferences.
Reduced motion, higher contrast, forced colors, coarse pointers, keyboard use,
and 200% zoom are part of the design contract.

The New York skyline photograph is by Diane Picchiottino and was provided from
[Unsplash](https://unsplash.com/) as
`diane-picchiottino-EZ_SHxykcgw-unsplash.jpg`; the checked-in optimized product
asset is `public/nyc-skyline-diane-picchiottino.jpg`.

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

The UI uses local platform fonts and does not download a web font during build.
On Node 24, building without `DATABASE_URL` may print known PGlite worker noise
after successful route generation. The production PostgreSQL path is the
supported clean build path.

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
- **API:** query-driven `/api/catalog` readers, `/api/plan`, owner-scoped
  correction/notification routes, authentication routes, and admin-only
  Bulletin sync plus correction review/application routes.

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
