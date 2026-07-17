# Progress Log: NYUSH Course Planner v0.2

## Session: 2026-07-17

### Phase 3: Shape v0.2 scope and alternatives

- **Status:** in progress
- Restored the completed v0.1 planning, research, verification, and commit context.
- Read the brainstorming, persistent planning, implementation-planning, Agent
  Reach, and Impeccable guidance required for this discovery pass.
- Confirmed that the working tree was clean before beginning v0.2 planning.
- Created a separate persistent v0.2 discovery workspace; no application code
  has been changed.
- Audited Bulletin constants/source interfaces, snapshot tables, program option
  generation, the planner header, and the current admin surface.
- Confirmed that minor and double-major state primitives mostly exist, but the
  live UI exposes only single-major options and no custom program editor.
- Confirmed that no correction submission or admin review workflow exists.
- Read the NYU undergraduate root, a representative New York school Bulletin,
  the global course A–Z index, and the referenced Apple-design skill through
  Agent Reach routes.
- Established that the global course index mixes levels/campuses and cannot be
  used as an indiscriminate New York ingestion allowlist.
- Extracted the Apple reference's applicable product principles while rejecting
  decorative all-over glass and non-functional animation.
- Confirmed that school Bulletins expose their own program and course indexes;
  CAS alone introduces joint/dual credentials beyond the current classifier.
- Completed the bounded Apple reference read, including typography,
  accessibility preferences, feedback categories, and prototyping guidance.
- Audited global design tokens, button primitives, icon usage, course/program
  schemas, study-away sites, and the full-catalog client delivery path.
- Identified catalog-payload scaling, program-kind, typography-token, semantic
  button sizing, and transparency/contrast fallback work for v0.2.
- Confirmed that plan sync exposes no live save/offline/error state and silently
  ignores autosave failures after initial load.
- Confirmed that plan mutations have no undo/redo history and version-1 saved
  plans do not record the catalog release that their program IDs came from.
- Confirmed with Stern and Tandon samples that school indexes share a discovery
  pattern but course metadata and level/cross-listing conventions vary.
- Confirmed that New York prerequisites can reference courses across Stern,
  Shanghai, Abu Dhabi, and Tandon, requiring preserved unresolved references
  and later cross-source reconciliation.
- Confirmed from current NYU Shanghai registration guidance that Bulletin data
  cannot imply term availability, eligibility, or degree fulfillment; v0.2 must
  label catalog-only New York records and keep Albert/official evaluation as the
  authority for those claims.
- Completed repository and source/design research; moved into release-boundary
  and approach selection without changing application code.
- Confirmed the app has drag transforms but no broad motion runtime; dependency
  choice should follow an interactive v0.2 prototype rather than precede it.
- User selected the recommended product boundary: NYUSH degree auditing remains
  authoritative, while New York courses are included for study-away planning.
- User confirmed that NYU colors must remain; Apple influence is limited to
  interaction quality, typography, materials, icons, control design, and motion.
- User approved the complete catalog architecture: all 13 New York school
  course inventories at v0.2 GA, staged adapter validation, independently
  refreshable source snapshots, composed releases, and separate reviewed
  overlays.
- Completed release-boundary selection and began section-by-section design
  validation with the Program Profile workflow next.
- User approved the Program Profile: Core plus a primary major, optional second
  major, NYUSH minors, explicit double-counting visibility, requirement
  explanations, and catalog-aware saved-plan migration.
- External or cross-school programs remain review-driven overlays rather than
  automatically imported degree audits.
- User approved the Correction Hub as a planner-maintainer review system with
  contextual reports, explicit states, student history, an admin inbox, audited
  overlays, and a clear non-official boundary.
- User approved NYU Academic Glass: NYU colors remain primary, system typography
  and standardized Lucide icons replace imitation, glass stays functional and
  limited, motion stays interruptible, and an interactive prototype gates the
  broader visual rollout.
- User approved the final reliability, verification, migration, and rollout
  section, including automatic validated publication, last-known-good source
  retention, local-first plans, Undo, security gates, and GA conditions.
- Completed section-by-section design validation and began consolidating the
  approved v0.2 specification; application code remains unchanged.
- Wrote the complete approved specification at
  `docs/superpowers/specs/2026-07-17-nyush-v0-2-product-design.md`.
- Self-reviewed the specification for scope contradictions, unresolved
  placeholders, source/authority ambiguity, heading completeness, and diff
  whitespace errors; all corrected checks pass.
- Tightened undergraduate inclusion rules so explicitly graduate records are
  excluded and ambiguous-level records are quarantined instead of guessed.
- Prepared the reviewed specification and persistent planning record for a
  dedicated design commit and user review checkpoint.
- User approved the committed specification and requested complete
  implementation plans without execution.
- Started Phase 6 using the writing-plans workflow and selected separate plans
  for independently testable catalog, search, Program Profile, Correction Hub,
  visual-system, and integration/GA workstreams.
- Mapped the current application, API, database, Bulletin, planner, component,
  and test file inventory to anchor exact plan ownership.
- Audited the current single-active-snapshot tables and repository transaction;
  the backend plan will replace them with source snapshots plus composed catalog
  releases while preserving the existing validation-first publication behavior.
- Audited the current `Course`, `CatalogProgram`, `CatalogCandidate`, placement,
  fulfillment, and version-1 plan contracts so later plans can define exact
  schema-compatible migrations and cross-workstream interfaces.
- Audited Shanghai-specific discovery, source metadata, course-page identity,
  normalization, and validation entry points. The ingestion plan will introduce
  a source registry plus school-aware adapters without weakening existing URL,
  identity, or lossless-source assertions.
- Confirmed that current normalized courses hard-code `sites: ["shanghai"]`
  and sparse provenance; the catalog plan must extend the shared course contract
  before any New York adapter can publish safely.
- Read the bundled Next.js 16 Route Handler and Cache Components guides. The
  query plan will keep database-backed search request-time by default and avoid
  assuming GET handlers are cached; any shared caching belongs in extracted
  helpers and is added only with explicit invalidation semantics.
- Audited the current `/api/catalog` -> repository -> `CatalogProvider` path and
  confirmed that the bundled fallback and full DB course list are both retained
  client-side. Plan 2 will split bootstrap metadata from paginated course search
  and change provider ownership accordingly.
- Confirmed that coherence validation currently assumes every course is present
  in the bootstrap response. Plan 2 will separate release/program/rule bootstrap
  validation from paginated course-page validation and add a batch-by-ID path
  for placements, prerequisites, and custom-course shadowing.
- Audited `CourseCatalog`, `useCourseData`, `PlannerApp`, and the drag/detail
  consumers. The query plan will keep a normalized client course cache containing
  search pages plus every placed/detail course so planner engines never depend on
  only the currently visible page.
- Audited plan import, API, repository, Zustand persistence, and autosave. Plan 3
  will introduce a discriminated v1/v2 parser, revision-aware repository writes,
  explicit 409 conflict payloads, local backup before migration, bounded history,
  and a visible sync-state contract instead of silent fetch failures.
- Confirmed that the current store exposes arbitrary `activePrograms`; Program
  Profile will become the persisted source of truth while a derived ordered ID
  list remains available at the engine boundary for incremental compatibility.
- Audited legacy degree presets, the crowded header selector, and derived-state
  consumers. Plan 3 will add `programProfile.ts` as the sole selection contract,
  expose a derived `activeProgramIds(profile)` adapter, and move editing into a
  dedicated responsive sheet without rewriting the deterministic engines.
- Audited existing admin authorization, page composition, Bulletin admin routes,
  and mutable catalog tools. Plan 4 will reuse `requireAdmin`, add owner-scoped
  student routes plus transition-checked admin routes, and replace full-catalog
  admin loading with the query contracts from Plan 2.
- Read the bundled Next.js 16 font guide and audited the root layout, button
  primitive, and global tokens. Plan 5 will remove Geist Sans while retaining a
  self-hosted mono face, define the legal platform stack in CSS, repair the
  recursive font token, and centralize semantic control sizes and press states.
- Audited the workspace, floating tools, inspiration image, sheets, dialogs, and
  existing design-rule tests. Plan 5 will add one glass primitive and preference
  fallbacks, prototype it in a development-only surface, then roll it into the
  existing one-column workspace without making content cards translucent.
- Audited Drizzle migrations, PGlite repository-test setup, Vitest configuration,
  and current scripts. Every schema-bearing plan will generate and test an
  ordered migration against an in-memory migrated database rather than relying
  on `db:push` behavior.
- Confirmed that no browser end-to-end runner exists. Plan 6 will add a narrowly
  scoped Playwright configuration and smoke journeys only after unit,
  integration, component, and production-build gates are green.
- Re-verified all 13 canonical New York undergraduate school roots from the
  central Bulletin so Plan 1 can contain an exact source registry instead of
  guessed URL slugs.
- Audited existing component-test mocking patterns and confirmed there are no
  Route Handler tests. Plans 2-4 will extract request parsing and repository
  behavior into pure/testable helpers, then keep route tests focused on auth,
  status codes, and serialized contracts.
- Read the bundled Next.js 16 Playwright guide and audited onboarding. Plan 6
  will run Playwright against a production build via `webServer`; Plan 5 will
  update the existing four-step guide copy and focus behavior rather than create
  a competing onboarding system.
- Audited requirement rendering, course evidence, and the current student/admin
  navigation so Correction Hub report entry points can stay contextual instead
  of becoming a disconnected generic form.
- Audited README promises and the two completed v0.1 implementation plans so the
  v0.2 documents use the same tracked-step format, exact verification commands,
  and small commit boundaries without repeating finished v0.1 work.
- Fixed the implementation-plan dependency order: source ingestion, query APIs,
  Program Profile and sync safety, Correction Hub, Academic Glass, then release
  integration and GA verification. No application code will be changed while
  producing these documents.
- Wrote six complete implementation plans under `docs/superpowers/plans/` for
  multi-source ingestion, query-driven discovery, Program Profile/plan safety,
  Correction Hub, NYU Academic Glass, and release integration/GA verification.
- Added exact source registry roots, stable course/program authority contracts,
  ordered Drizzle migrations (`0004`-`0006`), request-time Next.js route
  semantics, lossless plan-v2 migration, optimistic revisions, bounded Undo,
  owner/admin correction policies, typed overlays, and production-build browser
  verification.
- Cross-reviewed the six plans against the approved specification and corrected
  path ownership, Vitest command flags, interim endpoint compatibility, exact
  Correction Hub status semantics, duplicate merging, reviewed cross-school
  program exceptions, catalog-term metadata, trust signals, dark-theme tokens,
  and idempotent legacy placement identity.
- Verified every `Modify` path either exists now or is created by an earlier
  ordered plan; all plan headers, constraints, completion criteria, migration
  ordering, and product-boundary references are present. No application code,
  database, scrape, server, or deployment action was performed.

## Files created or modified

- `.planning/2026-07-17-v0-2-product-expansion/task_plan.md`
- `.planning/2026-07-17-v0-2-product-expansion/findings.md`
- `.planning/2026-07-17-v0-2-product-expansion/progress.md`
- `docs/superpowers/plans/2026-07-17-v0-2-multi-source-catalog-ingestion.md`
- `docs/superpowers/plans/2026-07-17-v0-2-query-catalog-discovery.md`
- `docs/superpowers/plans/2026-07-17-v0-2-program-profile-plan-safety.md`
- `docs/superpowers/plans/2026-07-17-v0-2-correction-hub.md`
- `docs/superpowers/plans/2026-07-17-v0-2-nyu-academic-glass.md`
- `docs/superpowers/plans/2026-07-17-v0-2-release-integration-ga.md`

## Error log

| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-07-17 | Combined skill output was truncated | 1 | Re-read the required skill files independently and in bounded chunks |
| 2026-07-17 | Sandboxed GitHub CLI could not read its user config and Jina Reader could not connect | 1 | Re-ran the same read-only public research with approved external access |
| 2026-07-17 | Combined external research output was truncated | 1 | Persisted confirmed findings, then switched to bounded source-specific reads |
| 2026-07-17 | Parallel school-page filtering returned a non-zero result and emitted only the CAS response | 1 | Preserved the valid CAS evidence and changed to independent bounded reads |
| 2026-07-17 | A secondary icon-import count pattern returned no matches and made the combined audit command exit 1 | 1 | Used the successful primary import count and direct source inspection; no retry needed |
| 2026-07-17 | A combined audit of discovery, sync, planner, and persistence files exceeded the available output context | 1 | Abandoned the oversized read and split the remaining audit into bounded subsystem reads |
| 2026-07-17 | The expected `src/components/planner/PlanSync.tsx` path did not exist | 1 | Found the actual component at `src/components/PlanSync.tsx` with a bounded file search |
| 2026-07-17 | A findings patch failed because copied PowerShell output contained mojibake while the file remained valid UTF-8 | 1 | Re-anchored the patch on ASCII section headings and applied the update without changing file encoding |
| 2026-07-17 | Two follow-up patches looked for a task-plan error row inside `findings.md` | 2 | Corrected the patch targets and kept the intended research update unchanged |
| 2026-07-17 | Agent Reach v1.5.0 could not complete its optional update check after three network retries | 1 | Kept the installed version; the completed source research was unaffected |
| 2026-07-17 | The first specification assertion looked for `Catalog course` as one literal substring even though Markdown wrapped it across lines | 1 | Used a whitespace-tolerant pattern and completed the full specification check successfully |
| 2026-07-17 | PowerShell treated brackets in the NextAuth route filename as wildcard syntax during the line-count audit | 1 | Preserved the successful file inventory and will use `Get-Content -LiteralPath` for bracketed paths |
| 2026-07-17 | Two PowerShell plan-audit loops attempted to pipe directly from `foreach` and failed to parse | 2 | Stored loop output in arrays before formatting and completed the audits |
| 2026-07-17 | The first no-marker assertion matched the release plan's intentional unfinished-marker search command | 1 | Excluded the inspection command and verified all actual plan content without unresolved markers |
