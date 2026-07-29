# Findings: NYUSH Course Planner v0.2 Implementation

## Starting state

- Branch: `codex/bulletin-academic-workspace`.
- The workspace is a normal checkout rather than a linked worktree; the user
  explicitly requested inline execution and no further approval checkpoints.
- Dependencies were already current after `npm install`.
- Baseline: 39 Vitest files and 344 tests pass with one worker.
- The six approved implementation documents are committed at `af3d64e` and are
  the execution authority for this phase.

## Active implementation findings

- 2026-07-28 rebaseline: the authoritative branch is now `main` at `1e0f7ea`
  (`v0.3.2 Requirements fix`), matching `origin/main`. The previous v0.2
  feature branch is no longer the current execution base.
- The repository has advanced through v0.2.1, v0.2.2, v0.3.1, and v0.3.2.
- The working tree contains user/uncommitted changes in `package.json`,
  `scripts/catalog-status.ts`, `scripts/fill-ny-catalog.ts`, and
  `src/db/index.ts`, plus new `scripts/lib/db-retry.ts` and
  `scripts/update-nyush-programs.ts`. These must be preserved and understood
  before any implementation work.
- No checked-in `vercel.json` or `.openai/hosting.json` is present. The Neon +
  Vercel deployment may therefore rely on dashboard/project settings and
  environment variables rather than repository-local hosting metadata.
- `DEPLOY.md` documents the intended production topology: Vercel hosts the
  Next.js application; a Neon pooled `DATABASE_URL` backs Drizzle/Auth.js;
  schema migrations and Bulletin/catalog population are run manually from an
  operator machine; Vercel receives `AUTH_SECRET`, `AUTH_URL`, OAuth provider
  credentials, and `ADMIN_EMAILS` through project settings.
- Production request paths read only the database. Bulletin/Albert network
  access is operator/admin initiated, not triggered by student page loads.
- The current uncommitted `src/db/index.ts` replaces Drizzle's URL shortcut
  with an explicit `pg.Pool`, adds keepalive/timeouts, and handles idle Neon
  connection errors. `scripts/lib/db-retry.ts` adds exponential retry for
  transient remote connection failures; `catalog-status` uses it.
- The uncommitted catalog operations extend the hosted workflow: up to four
  missing-source retry passes for New York ingestion and an in-place NYUSH
  program-definition updater for the active release.
- v0.3.1 changed the source registry so Dentistry and SPS remain configured but
  disabled because their Bulletin boundaries were judged graduate/professional
  rather than usable undergraduate inventory. This materially differs from the
  original v0.2 wording that claimed all 13 New York inventories were enabled.
- v0.3.1/v0.3.2 also reposition requirements as fallible auto-extracted
  planning guidance, added an explicit user warning, and manually corrected
  several Core `all` nodes into `choose` nodes.
- Potential policy mismatch to resolve later: the new in-place program updater
  rewrites `catalogProgram.data` inside an active source snapshot, while the
  v0.2 architecture described source snapshots as immutable and corrections as
  reviewed overlays. No judgment or change has been made yet.
- Release metadata is inconsistent with repository history: commits are named
  v0.3.1/v0.3.2, but `package.json` remains `0.2.0`, the README title remains
  v0.2, and the v0.2 verification report still says GA is blocked. Those files
  cannot be treated as an accurate description of the deployed release until
  explicitly reconciled.
- There is no local `.vercel/project.json`; the live Vercel project linkage and
  environment configuration are external to this checkout. The user's report
  that it is running on Neon + Vercel is therefore the authority for current
  deployment state.
- Current uncommitted Neon/catalog changes pass `npx tsc --noEmit`, and
  `git diff --check` reports no whitespace errors.

- `CatalogProgramSchema` is a plain Zod object used directly by bootstrap and
  repository readers. Authority defaults must therefore remain backward
  compatible with existing JSON and test casts; normalization can emit explicit
  roles while the schema supplies safe defaults for v0.1 rows.
- Shanghai program construction is centralized in `normalizeProgram`, providing
  one place to emit `auditAuthority` and roles derived from `type` without
  changing requirement engines.
- `CatalogProvenance` currently identifies source URL, snapshot, and hash only;
  source identity belongs on the new wrapper rather than being forced into the
  existing engine-facing `Course` object.
- Typecheck failure is caused by the intended parsed-output contract: runtime
  schema defaults accept v0.1 JSON, while newly constructed `CatalogProgram`
  values must emit authority fields explicitly. The correct source fix is to
  update normalization and typed fixtures, not weaken the v0.2 output type.
- Only four test modules construct `CatalogProgram` values directly. Adding the
  explicit NYUSH authority/role metadata to those fixtures keeps the strict
  parsed contract without widening engine-facing types.
- Discovery currently models program/subject lists only and the production
  fetch allowlist permits Shanghai plus sitemap. Source-aware discovery must
  extend both contracts and the fetch allowlist together; otherwise mocked New
  York tests would pass while real synchronization would be blocked.
- Only four fixture modules construct `BulletinDiscovery` directly, so the new
  source metadata can be required and migrated explicitly rather than optional.
