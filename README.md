# NYUSH Course Planner

Interactive four-year course planner for NYU Shanghai students, backed by the
official NYU Bulletin program requirements and course inventory, with
prerequisite checking, cross-listing allocation, study-away planning, and live
degree progress.

```bash
npm install
npm run db:push # create tables (dev: local PGlite, no server needed)
npm run dev     # http://localhost:3000
npm test        # vitest unit + DB integration tests
```

## Multi-user (v2) — accounts & database

The app now supports per-user accounts (Phase 1 of the productization roadmap in
`.claude/plans/`), while still working fully signed-out.

- **Database** — Drizzle ORM over Postgres. With no `DATABASE_URL`, dev uses
  **PGlite** (embedded Postgres, data in `.pglite/`, gitignored) — nothing to
  install. For production set `DATABASE_URL` to a Neon/Supabase Postgres and run
  the migrations in `drizzle/`. Schema: [src/db/schema.ts](src/db/schema.ts).
- **Auth** — Auth.js v5, gated to `@nyu.edu` emails ([src/auth.ts](src/auth.ts)).
  In dev, sign-in is a passwordless **magic link printed to the server console**
  (visit `/signin`, enter a `netid@nyu.edu` address, open the logged URL). In
  production, set the OAuth env vars and Microsoft Entra / Google buttons appear.
  Non-NYU emails are rejected before any link is sent.
- **Plans** — saved per user as a JSONB `PlanSnapshot` via
  [app/api/plan/route.ts](src/app/api/plan/route.ts) +
  [repository.ts](src/lib/repository.ts); the client syncs through
  [PlanSync.tsx](src/components/PlanSync.tsx) (loads on login, offers to import a
  guest plan, autosaves). Signed out, everything stays in localStorage as before.

### Env vars (`.env.local`)
```
AUTH_SECRET=...            # required; generate with: npx auth secret
ADMIN_EMAILS=a@nyu.edu,b@nyu.edu   # who can access /admin
# DATABASE_URL=postgres://...        # unset in dev → PGlite
# AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER   # prod OAuth (optional)
# AUTH_GOOGLE_ID/SECRET                       # prod OAuth (optional)
DEEPSEEK_API_KEY=...       # AI course importer
```

## Official NYU Bulletin synchronization

The shared catalog is sourced from the official
[NYU Shanghai Undergraduate Bulletin](https://bulletins.nyu.edu/undergraduate/shanghai/).
The synchronizer discovers every listed major, minor, and subject page, parses
the Core curriculum, validates the complete candidate, and only then activates
one immutable snapshot. Bulletin snapshots are trusted first-party data and are
published automatically after validation; they do not wait in an editorial
approval queue.

### Scheduled operation

Run the database migrations in `drizzle/` before the first synchronization and
set `DATABASE_URL` for the production Postgres database. The scheduler command
is:

```bash
npm run bulletin:sync
```

A typical daily cron entry is:

```cron
15 3 * * * cd /app/nyush-course-planner && npm run bulletin:sync
```

Use the scheduler's configured timezone when choosing the hour. A successful
run prints `published` with snapshot/document/course/program counts. If the
validated source hash already matches the active snapshot, it prints `no-op`;
no catalog rows are rewritten.

Operational visibility is available to admins at
`GET /api/admin/bulletin/status`. An authenticated admin can also trigger the
same workflow with `POST /api/admin/bulletin/sync`. The database lock prevents
overlapping runs. A failed fetch, parse, validation, or activation never retires
the current active snapshot: activation is one transaction, so readers continue
to receive the prior last-known-good version.

After a successful production sync, refresh the checked-in disaster-recovery
fallback from that same active snapshot:

```bash
npm run catalog:generate-fallback
npm test -- src/lib/data.test.ts
```

The fallback is generated atomically and is never assembled by hand. Official
references to courses absent from the current inventory are retained for audit,
but remain non-executable manual-confirmation warnings rather than fabricated
courses.

Future user-submitted corrections and additions should be implemented as
reviewed correction overlays: request, review, approve, then apply an overlay on
top of an official snapshot. They must not silently mutate or replace the
archived Bulletin source snapshot.

## Shared course catalog & admin (v2 Phase 2)

The course catalog now lives in the database (`course` table) and is shared by
all users — the bundled `courses.json` is just the **seed** loaded on first run
([repository.ts](src/lib/repository.ts) `ensureCatalogSeeded`).

- **Reading** — the client fetches `/api/catalog`
  ([CatalogProvider](src/components/CatalogProvider.tsx)) and falls back to the
  bundled JSON if the DB is unreachable. `useCourseData` merges this shared
  catalog with each user's personal custom courses.
- **Admin** — users listed in `ADMIN_EMAILS` get an **Admin** button →
  [`/admin`](src/app/admin/page.tsx). Paste one or many Albert listings
  (separate with `---` or back-to-back); the DeepSeek parser
  ([courseParser.ts](src/lib/courseParser.ts) / [listings.ts](src/lib/listings.ts))
  normalizes them, you **Preview**, then **Import** to the shared catalog.
  Non-admins are blocked server-side. Programs/sites remain JSON for now.

> **PGlite dev note:** the local embedded DB lives in `.pglite/` and is
> single-process. Don't run separate scripts against it while `next dev` is
> running (causes a WASM abort); if it gets wedged, `rm -rf .pglite && npm run db:push`.
> Production Postgres (Neon) has none of these limits.

## Special rules engine (v2 Phase 3)

Admin-authored **special rules** the deterministic engines consult (the engines
stay authoritative — rules are just data). Defined in
[types.ts](src/lib/types.ts) (`SpecialRule`), compiled into a `RuleContext`
([rules.ts](src/lib/rules.ts)) the validation/progress engines read:

- **`equivalence`** — course X counts wherever course Y is required (prereqs,
  `allOf` slots, and pools). Generalizes per-course `equivalentTo`.
- **`concurrentPrereq`** — course may be taken in the **same term** as a prereq,
  optionally gated on a self-reported grade (e.g. *an A in ICP lets you take
  Data Structures + Intro CS together*). Students set an **Expected grade** per
  placed course in the course dialog; it shows as a chip badge.

Rules live in the DB (`rule` table), are served via `/api/catalog`, and shown to
students in the **Special rules** panel
([SpecialRulesPanel](src/components/progress/SpecialRulesPanel.tsx)). Admins
manage them at `/admin` ([AdminRules](src/components/admin/AdminRules.tsx),
`/api/admin/rules`); a concurrency rule is seeded for demo.

## Import from Albert (v2 Phase 6 spike)

An on-demand admin importer that pulls a subject's courses from **NYU's public
class-search (FOSE) JSON API** — no login, no HTML scraping, no scheduled job
yet. At `/admin` → **Import from Albert**, enter a subject (e.g. `CSCI-SHU`),
**Fetch preview**, then **Import to catalog**.

- [albert.ts](src/lib/albert.ts) (server) calls `route=search` then
  `route=details`, deduping sections by course code and unioning
  `campus_location` across a course's sessions (rate-limited, capped, cached,
  honest User-Agent).
- [albertNormalize.ts](src/lib/albertNormalize.ts) (pure, unit-tested) maps the
  result to `Course`: code, title, credits (from `hours_html`), **campus →
  `sites`** (the study-away signal), term → `offered`, description, and any
  course codes found in `registration_restrictions` → `prereqs`.
- `POST /api/admin/albert` ({subject, commit}) previews or commits via
  `upsertCourses(source: "albert")`; admin-gated.

**AI prereq enrichment (optional):** check *"Use AI to read prerequisites from
the listing text"* and the import makes **one batched DeepSeek call** over the
courses' restriction/description prose, mapping course names → official codes
against the live catalog and writing structured AND-of-OR prereqs. Sanitized by
the pure, unit-tested `sanitizePrereqMap` (only code-shaped strings survive;
"instructor consent"/GPA-style text is ignored); enrichment **fails soft** — an
API hiccup never breaks the import, you just get the regex-only prereqs. The
stats line reports how many courses got AI prereqs.

**Known gaps (why it's a spike, not yet a scraper):** class-search reliably
gives code/title/credits/campus/term, but **prerequisite text is sparse at the
source** (many listings have an empty restrictions field — AI can't extract
what isn't there) and it carries **no program requirements / `fulfills`** —
those stay curated, or use the paste importer / Edit form for depth. A
scheduled version (Phase 6b) would just wrap `importSubject` on a cron into the
existing review flow.

## Feasibility / overload analyzer (v2 Phase 5)

The **Check feasibility** button (Degree Progress panel) answers "can I actually
finish on time, and will I have to overload?". The pure engine
([feasibility.ts](src/lib/feasibility.ts)) derives the courses still needed for
the active programs (missing `allOf` courses + `chooseN`/`creditsFrom` gaps),
pulls in their prerequisites, then greedily schedules them term-by-term
respecting prereq order, term offerings, study-away sites, capstone-in-senior-year,
and the 18-credit cap. It reports one of:

- **complete** — nothing left to schedule,
- **feasible** — fits by senior spring within a normal load,
- **feasible-with-overload** — only fits if some term exceeds 18 credits (those
  terms are listed),
- **infeasible** — some requirement can't be scheduled, each with a reason
  (e.g. "capstones must be taken on the Shanghai campus, but your Year 4 is set
  to a study-away site").

When there's a suggested schedule, **Auto-fill** drops it straight into the
plan. (Cross-listed electives can need a second pass, since a shared CS/IMA
course only counts toward one major.) The deterministic engines remain the
source of truth; the analyzer only reads them.

### Rules-authoring agent (v2 Phase 4)

At `/admin`, an admin describes a rule in plain English and the **agent**
([ruleParser.ts](src/lib/ruleParser.ts) via DeepSeek) converts it to a
structured `SpecialRule`, resolving course names → official codes against the
catalog. The pure sanitizer ([ruleSanitize.ts](src/lib/ruleSanitize.ts),
unit-tested) validates it and flags any unknown codes.

Rules go through a **draft → approval queue**: the agent saves as `draft`
(status column), an admin reviews it (Approve/Reject), and **only `active`
rules reach the engines** (`/api/catalog` and `getActiveRules` filter on
status). The LLM only *authors* data; the deterministic engines stay
authoritative. (The optional "look it up on Albert" research mode is deferred —
it needs the Phase 6 scraper/web infra and can't hit authenticated Albert.)
The deterministic rule engines (`validation`/`progress`/`allocation`) are
unchanged — the database only changes where their data lives.

## How it works

Everything is a **program** — NYUSH Core, the CS / Data Science majors, the IMA
major, and the IMA minor all share one JSON schema, so the progress rings,
requirement checklist, and validation engine are written once. **To add a new
major/minor (Econ, Finance, …), append an object to
[src/data/programs.json](src/data/programs.json) and add its courses to
[src/data/courses.json](src/data/courses.json). No code changes.**

### Program types & degree-plan presets

Each program has a `type`: `major`, `core`, or `minor`.
- **Majors** compete for a shared course via the cross-listing allocation
  toggle + double-count budget.
- **Core and minors** always *pass through* — a course credits them in addition
  to your chosen major (no contest). Only majors trigger the allocation toggle.

The header **Degree Plan** chooser swaps which programs are tracked. Presets live
in [src/lib/degreePlans.ts](src/lib/degreePlans.ts): CS+IMA, Data Science+IMA,
Data Science + IMA minor, and CS + IMA minor. The manual **Programs** checkboxes
still allow any custom mix.

Cross-listing detection is **active-aware**: Intro CS fulfills both CS and Data
Science, but those majors are never tracked together, so it is only flagged
"cross-listed" when two *active* majors actually compete for it
([activeCrossListedMajors](src/lib/data.ts)).

### Data files (`src/data/`)

| File | What it defines |
| --- | --- |
| `programs.json` | Requirement categories per program. Rules: `allOf` (every course), `chooseN` (n from a pool), `creditsFrom` (min credits from a pool). `isCapstone: true` marks capstone categories. `doubleCountLimit` caps courses shared between two majors. |
| `courses.json` | Course database. `prereqs` is AND-of-ORs (`[["A","B"],["C"]]` = (A or B) and C). `offered` = term pattern, `sites` = where it can be taken, `fulfills` = which program categories it can satisfy. A course fulfilling **two majors** is cross-listed and gets the allocation toggle. |
| `sites.json` | Study-away sites. Exactly one entry needs `isHome: true`. |

All three files are Zod-validated with referential-integrity checks at load
([src/lib/data.ts](src/lib/data.ts)) — a typo in a course id fails loudly at
dev time instead of silently breaking progress math.

### Course codes are a curated subset

The ~48 courses are realistic but hand-written — verify codes, prerequisites,
and requirements against the official NYUSH bulletin and edit the JSON freely.
Unit tests will catch structural mistakes (`npm test`).

### AI course import (paste from Albert)

Click **Add course from Albert** in the catalog, paste a full course listing
(description, prerequisites, fulfillment text, term, units, location), and
DeepSeek extracts a structured course you can preview and save. Requires
`DEEPSEEK_API_KEY` in `.env.local` (gitignored — never commit the key; the key
only lives server-side in the [/api/parse-course](src/app/api/parse-course/route.ts)
route).

- Saved courses live in localStorage (`customCourses` in the store) and merge
  over the built-in catalog — re-importing an existing code replaces it, so
  you can fix built-in data without touching JSON files.
- Custom courses count toward `chooseN`/`creditsFrom` requirement pools via
  their `fulfills`; `allOf` categories still demand the exact listed courses.
- The AI's output is sanitized server-side: unknown fulfillment targets and
  sites are dropped, then validated against the course schema.
- Custom courses ride along in plan Export/Import files.

### Editing courses & equivalences

Open any course → **Edit course** to change credits, terms, sites,
prerequisites (one requirement per line, alternatives with "or"),
fulfillments (checkbox per requirement category), and **Equivalent to** —
course codes this course substitutes for. An equivalent satisfies the
target's slots in `allOf` rules, its spot in `chooseN`/`creditsFrom` pools,
and prerequisites that ask for it (e.g. Honors Calculus ≡ MATH-SHU 131).
Edits save as custom overrides, so built-in data is never destroyed —
"Delete custom course" reverts to the original.

### Warnings & timeline

- Every warning can be dismissed (eye-off icon) once you've confirmed it's
  intentional; dismissed warnings collapse into a restorable section and
  stop flagging course chips.
- Semesters are labeled with real terms ("Fall 2025") computed from the
  entry year selected in the header ("Entered Fall 2025 · Class of 2029"),
  with numbered year cards and fall/spring icons. Light/dark theme toggle
  in the header.

### Architecture

- **State** ([src/store/plannerStore.ts](src/store/plannerStore.ts)) — Zustand
  with localStorage persistence. Only raw facts are stored: placements
  (course → semester + allocation), study-away sites, completed semesters,
  active programs.
- **Derived logic** (pure, unit-tested, in `src/lib/`):
  - `allocation.ts` — resolves which major a cross-listed course counts
    toward (`auto` / specific major / `split`), tracks the double-count budget.
  - `validation.ts` — prereq order, term offering, site availability,
    12–18 credit load band, capstone-before-senior-year, budget overrun.
  - `progress.ts` — per-program completion (earned vs planned) and the
    128-credit graduation total.
- **UI** — Next.js App Router, Tailwind v4, shadcn/ui (Base UI), dnd-kit.
  Drag courses onto semesters, or use the ⊕ dropdown on any catalog card.
  Click any course for details, allocation toggle, and warnings.

### Plan portability

Export/Import buttons round-trip the whole plan as JSON; imports are validated
and unknown course ids are dropped (safe after editing the data files).
