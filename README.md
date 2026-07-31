# NYUSH Course Planner

A free, unofficial four-year course planner for NYU Shanghai students. Pick your
programs, lay courses across eight semesters, and see how the plan lines up with
the NYU Bulletin — with prerequisite, term, study-away, and workload warnings.

**This is not a degree audit.** It has no authority, it is not affiliated with
NYU, and it can be wrong. Always confirm against the current
[NYU Shanghai Bulletin](https://bulletins.nyu.edu/undergraduate/shanghai/) and
your academic adviser.

---

## The core design principle

> **The Bulletin is displayed faithfully. The computer's interpretation is a separate, clearly-marked layer.**

Requirement tables render exactly as the Bulletin publishes them — same headings,
order, credits, and footnotes. Separately, the app tries to compile those rows
into checkable rules. When it cannot prove an interpretation, it marks the row
`unavailable`, withholds the degree percentage, and shows only the official text.
**Saying "I don't know" always beats a confident wrong answer.**

Everything else follows from this: immutable source snapshots, a certification
step before publication, corrections as reviewable overlays rather than edits,
and machine translation that never replaces the English original.

## Feature overview

- **Planner** — eight-semester board with drag-and-drop, keyboard assignment,
  variable credits, undo/redo, study-away sites, capstone rules.
- **Catalog** — search across NYU Shanghai plus 11 New York schools (~7,600
  courses) with campus/school/subject/credit filters.
- **Progress** — source-faithful Bulletin requirements, a beta interpretation
  layer, manual evidence for waivers and placements, and a feasibility check.
- **Accounts** — `@nyu.edu` Google sign-in, per-user cloud sync with conflict
  resolution; full guest mode with local storage and no account.
- **Corrections** — students report a problem; maintainers review and apply it as
  an audited overlay.
- **Admin** — announcements, About-page editing, catalog and requirement
  maintenance, AI-assisted import tools.
- **Bilingual** — English and 简体中文 UI; Bulletin prose can be machine
  translated on demand, with English remaining authoritative.

## Quick start

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev:full
```

`dev:full` applies the schema, seeds the catalog if empty, fills the New York
catalog, verifies it, then starts the server — in the right order for
single-process PGlite. Useful flags: `-- --fresh` (rebuild the local database),
`-- --no-ny` (NYU Shanghai only, much faster), `-- --port 3000`.

> **PGlite is single-process.** Never run a database script (`db:seed`,
> `fill-ny-catalog`, `resync-source`, `dev:full`) while `npm run dev` is up — it
> will corrupt the local database. Those scripts now detect a running server and
> refuse. `npm run catalog:status` prints current catalog health.

## Architecture in one pass

```
Bulletin (bulletins.nyu.edu)
   │  scrape → parse → normalise → validate      [fails closed]
   ▼
Immutable source snapshots ──► certification ──► composed release  (Postgres)
   │
   ▼
/api/catalog/*  ──►  client cache  ──►  pure rule engines  ──►  UI
                                          (allocation, progress,
                                           validation, feasibility)
```

- **Pure engines** (`src/lib/`) make every academic decision. They take plain
  data, are fully unit-tested, and never call the network or database.
- **The database supplies data; the LLM only drafts it.** DeepSeek is used for
  import parsing, rule drafting, and translation — always behind human review or
  clearly labelled as machine output. It never decides whether a requirement is
  met.
- **Zod schemas** (`src/lib/types.ts`) are the single contract at both the
  database and engine boundaries.

Deeper docs: [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) (the Bulletin
pipeline and certification workflow), [`DEPLOY.md`](DEPLOY.md) (Vercel + Neon),
[`docs/CONSULTANT.md`](docs/CONSULTANT.md) (for domain experts — how to
contribute without writing code).

## Project layout

| Path | What lives there |
|---|---|
| `src/lib/` | Pure rule engines, Zod contracts, Bulletin pipeline, repositories |
| `src/components/` | React UI (planner, catalog, progress, admin, about) |
| `src/app/` | Next.js routes and API handlers |
| `src/data/` | Checked-in recovery catalog and reviewed manifests |
| `scripts/` | Operational CLIs (seed, sync, certify, publish, status) |
| `drizzle/` | Ordered SQL migrations |

## Known gaps

Honest list; several were raised by a domain reviewer and verified in code.
Measured against the current 810-course NYU Shanghai catalog:

- **No winter or summer sessions** — only eight terms exist.
- **Prerequisites are barely populated** — the engine checks them, but only
  14 of 810 courses have machine-readable prerequisites (619 have unparsed text).
- **No course equivalences** — the mechanism exists; 0 courses use it, so
  NYC↔Shanghai substitution does not work yet.
- **Term availability is incomplete and can be stale** — 382 of 810 courses have
  any term recorded, and the Bulletin lags reality; live Albert schedules are
  not read.
- **Double-count limits are not enforced** for Bulletin-derived programs.
- **Requirement mapping is partial** — 536 of 810 courses are mapped.
- **Overload only warns**; no tuition-cost estimate.

## Contributing

- **Domain experts (no coding):** read [`docs/CONSULTANT.md`](docs/CONSULTANT.md).
  The most valuable contribution right now is course equivalences and real term
  availability.
- **Students:** use the in-app *Report catalog issue* button — it captures full
  context for maintainers.
- **Developers:** `npm test`, `npm run lint`, and `npx tsc --noEmit` should all
  pass. Read [`AGENTS.md`](AGENTS.md) — this repo pins a Next.js version whose
  conventions differ from older documentation.

## Credits

Built by Ryan Gu with Claude Opus, Claude Fable, and Codex GPT Sol 5.6.
Contact: mg8974@nyu.edu. Skyline photograph by Diane Picchiottino (Unsplash).

Not affiliated with, endorsed by, or operated by New York University.
