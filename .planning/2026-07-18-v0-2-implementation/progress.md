# Progress Log: NYUSH Course Planner v0.2 Implementation

## Session: 2026-07-18

- Activated single-agent inline execution for all six approved plans.
- Read the execution, worktree, TDD, and persistent-planning workflows.
- Confirmed branch `codex/bulletin-academic-workspace`; no application changes
  were present at the start.
- Ran `npm install`; dependencies were already current.
- Ran the full baseline suite successfully: 39 test files and 344 tests passed
  in 65.52 seconds with `--maxWorkers=1`.
- Started Phase 1 and loaded the complete multi-source ingestion plan.
- Plan 1 Task 1 RED: `identity.test.ts` failed because the identity module did
  not exist, confirming the test exercises the new boundary.
- Plan 1 Task 1 GREEN: added canonical identity, strict catalog source/course/
  release schemas, the exact Shanghai plus 13-school source registry, and
  NYUSH program authority/profile-role metadata.
- Verified Task 1 with 8 focused test files (114 tests), TypeScript, and
  whitespace checks; all passed.
- Committed Plan 1 Task 1 as `0715c26` (`feat(catalog): define multi-source identity`).
- Plan 1 Task 2 RED: the discovery suite reported five expected failures for
  the missing source-aware entry point, metadata, and New York fetch boundary.
- Implemented source-bounded discovery for Shanghai and configured New York
  schools, retained the Shanghai compatibility adapter, and expanded the fetch
  allowlist only to enabled registry roots.
- Tightened program-index identity after a regression test showed that the
  generic suffix check incorrectly accepted `Graduate Programs`.
- Verified Task 2 with TypeScript and five focused suites: 102 tests passed.
- Committed Plan 1 Task 2 as `8d50866` (`feat(bulletin): discover configured sources`).
- Plan 1 Task 3 RED: five New York parser assertions failed at the Shanghai-only
  identity boundary, proving the new source-aware API was not implemented.
- Added minimal CAS, Stern, and Tandon subject fixtures and a registry-driven
  parser API. Parsed records now retain school/campus provenance, raw detail
  labels, grading, repeatability, level, cross-lists, unknown credit state, and
  graduate prerequisite references without deriving planner semantics.
- Verified Task 3 with 96 parser, normalization, sync, and validation tests,
  followed by TypeScript and whitespace checks; all passed.
- Committed Plan 1 Task 3 as `8d4b8ae` (`feat(bulletin): parse New York course metadata`).
- Plan 1 Task 4 RED: the level suite failed because the classifier module was
  absent; source-normalization and source-validation suites then failed at
  their intentionally missing entry points.
- Added conservative explicit-level/code-convention classification, source-
  scoped catalog record normalization, graduate exclusion, ambiguous-course
  quarantine, catalog-only New York offering semantics, and source anomaly
  validation gates.
- Verified Task 4 with 116 parser/classifier/normalization/validation/sync
  tests, TypeScript, and whitespace checks; all passed.
- Committed Plan 1 Task 4 as `1afa124` (`feat(catalog): normalize undergraduate source records`).
- Plan 1 Task 5 RED: the new repository scenarios failed because source
  publication/release functions did not exist, while legacy tests continued
  to pass against the global-snapshot model.
- Added source registry persistence, per-source active snapshots, flattened
  stable course records, composed releases and membership, transactional
  source publication/composition, source status readers, and deterministic
  unchanged-source reuse.
- Generated migration `0004_multi_source_catalog`, then completed its ordered
  Shanghai backfill and one-source active-release bootstrap without editing
  generated metadata.
- Added and passed an offline v0.1 migration rehearsal proving legacy course
  identity/data and active release membership survive the migration.
- Verified Task 5 with 32 repository/persistence tests, TypeScript, and
  whitespace checks; all passed.
- Committed Plan 1 Task 5 as `6db4b8f` (`feat(catalog): compose source snapshots into releases`).
- Added minimal authored course-index and subject fixtures for all remaining
  New York schools plus one parameterized adapter matrix covering every one of
  the 13 configured New York sources exactly once.
- Verified Task 6 with 64 adapter/parser/normalization tests, TypeScript, and
  whitespace checks; all passed.
- Committed Plan 1 Task 6 as `c508136` (`test(bulletin): cover all New York school adapters`).
- Plan 1 Task 7 RED: the orchestration suite failed because `syncAll` did not
  exist. Added source-scoped locks, single-source refresh, registry-ordered
  orchestration, last-known-good composition, incomplete-release prevention,
  and unchanged membership reuse.
- Verified Task 7 with 28 sync/orchestration/repository tests, TypeScript, and
  whitespace checks; all passed, including concurrent Shanghai/Stern locks and
  duplicate-Stern exclusion.
- Committed Plan 1 Task 7 as `073d46e` (`feat(bulletin): refresh sources independently`).
- Read the installed Next.js 16 Route Handler guides before changing API code.
- Added active-release catalog reads, release-aware public response validation,
  client flattening compatibility, explicit multi-source CLI selection,
  per-source admin status/sync contracts, and database-backed New York catalog
  documentation.
- Verified Task 8 with 57 catalog/repository/client/CLI tests, ESLint, and
  TypeScript; all passed.
- Plan 1 Task 9 verified the complete Bulletin/persistence slice: 13 files and
  211 tests passed. The full repository then passed 45 files / 410 tests,
  ESLint, and TypeScript.
- Production build reached Next compilation but failed only because the
  sandbox could not download Geist/Geist Mono from Google Fonts. This external
  font dependency will be removed by the approved Academic Glass plan; no data
  or TypeScript build defect was reported.
- Policy inspection confirmed New York normalization forces catalog-only
  offering semantics and all 13 New York IDs appear exactly once in the
  registry adapter matrix. No live sync or production publication was run.
- Began Plan 2 after reading its complete query-discovery plan and the installed
  Next.js caching guide. Task 1 RED confirmed the contracts module was absent.
- Added strict bootstrap/query/page/detail/batch contracts, deterministic URL
  serialization, batch deduplication, and opaque release-bound cursors.
- Verified Plan 2 Task 1 with 5 contract tests and TypeScript; all passed.
- Committed Plan 2 Task 1 as `5c619d1` (`feat(catalog): define query API contracts`).
- Added active-release-only search, keyset pagination, stable detail/batch
  lookup, and course-free bootstrap aggregates. Search escapes wildcard input
  and applies source/campus/subject/level/catalog-pattern/credit/cross-list and
  fulfillment predicates to flat release-member columns.
- Verified Plan 2 Task 2 with 15 search/repository tests; all passed.
- Committed Plan 2 Task 2 as `0b69dbd` (`feat(catalog): query the active release`).
- Started Plan 2 Task 3 and added request-time/no-store bootstrap, search,
  batch, and stable-detail handlers plus safe shared error serialization.
- Ran `next typegen` so Next.js 16's generated `RouteContext` recognizes the
  new dynamic detail route; TypeScript then passed. Route contract tests and
  the Task 3 commit remain next.
- Plan 2 Task 3 route tests caught malformed JSON returning 503 instead of 400;
  the shared serializer now maps it to a bounded `invalid_request` response.
- Verified all four route contracts plus the legacy endpoint with 4 tests,
  ESLint, regenerated Next route types, TypeScript, and whitespace checks.
- Completed Plan 2 Task 4 with a typed abort-aware catalog client and a
  versioned, release-aware normalized course cache capped at 500 persisted
  records. The cache preserves pinned placements across releases as stale,
  indexes duplicate official codes without collapsing source identities, and
  recovers from corrupt browser storage.
- Verified the client/cache slice with 10 tests, ESLint, and TypeScript; all
  passed.
- Completed Plan 2 Task 5: CatalogProvider now loads only release bootstrap
  metadata, hydrates a bounded source-scoped cache, batches missing stable
  placement IDs, aborts request work on unmount, and exposes explicit
  loading/ready/stale/error states. The degree adapter retains stable identity
  and does not collapse duplicate official codes.
- Retired the legacy full-catalog route with a 308 bootstrap redirect and
  removed all client component/store imports of the 4.3 MB bundled course
  fallback. Lightweight programs/sites metadata now supports the offline shell.
- Verified the provider, adapter, route, client, and plan-import slice with 21
  tests plus ESLint and TypeScript; all passed.
- Completed Plan 2 Task 6 with a URL-shareable, abort-aware search state
  machine. Text input is debounced while filters apply immediately; stale
  requests cannot overwrite newer results, load-more work is deduplicated and
  cancellable, release mismatches restart cleanly, and offline cache matches
  remain explicitly marked stale.
- Rebuilt Course Catalog around bounded server pages with campus, school,
  subject, Bulletin-pattern, credit, and NYUSH-mapping filters; local custom
  and unplanned filters; accessible retry/loading/empty/load-more states; and
  mandatory New York catalog-only trust copy. Detail selection now carries a
  source-scoped stable ID or an explicit custom/legacy branch.
- Verified Task 6 with 10 hook/component tests, ESLint, TypeScript, and
  whitespace checks; all passed.
- Completed Plan 2 Task 7: stable-ID detail hydration now fetches once, reuses
  cache, cancels on close, batches known stable prerequisite links, keeps
  unresolved prerequisite codes visible without claiming satisfaction, and
  exposes source/campus/Bulletin edition/canonical URL/release/evidence and
  catalog-only availability trust signals plus the Correction Hub entry point.
- Placement stable IDs remain pinned and batch-loaded; unresolved planned
  courses render recoverable placeholder chips instead of disappearing.
  Admin lookup now uses the same bounded query client and clearly separates
  manual reviewed imports from immutable Bulletin records.
- Verified Task 7 with 10 focused tests, then the complete repository suite:
  53 files / 445 tests passed. ESLint and TypeScript also passed.
- Plan 2 Task 8 catalog gate passed 13 files / 68 tests; clean production
  build completed after replacing build-time Google font downloads with an
  offline system stack and externalizing PGlite's native filesystem/WASM
  package from Turbopack. Auth/database/catalog follow-up gates passed 14 tests.
- Production chunk inspection found no checked-in fallback course marker in
  `.next/static` or rendered server app output. The complete static chunk set
  is 2,188,113 bytes across 20 files (not a first-load transfer measurement;
  the exact route waterfall remains assigned to the Plan 6 release report).
- Local production HTTP smoke returned the designed private/no-store headers
  and bounded `catalog_unavailable` 503 response because this workspace has no
  published active catalog release. Route/repository tests already cover the
  success payload, pagination, cursor, and no-courses bootstrap contracts; no
  live sync or publication was performed merely to manufacture smoke data.
- Began Plan 3 and completed Task 1: Program Profile now structurally models
  required Core + primary major, optional distinct second major, and ordered
  minors. Catalog-aware validation uses explicit audit authority and role
  eligibility, admits reviewed overlays only for declared roles, rejects raw
  New York degree programs, retains unresolved IDs in diagnostics, and exposes
  a stable engine-order adapter.
- Verified Program Profile with 5 semantic tests, TypeScript, and ESLint.
- Completed Plan 3 Task 2 with discriminated v1/v2 plan parsing, structural
  preservation of unknown course/program references, source-scoped placement
  IDs, release IDs, deterministic legacy placement identities, unique-only
  course reconciliation, and explicit ambiguity diagnostics.
- Migration preserves plan fields and writes a valid v1 backup before v2; a
  corrupt input cannot overwrite an existing valid backup. Verified with 16
  plan I/O and migration tests plus TypeScript and ESLint.
- Completed Plan 3 Task 3 with schema migration `0005`, revision-bearing plan
  envelopes, compare-and-swap writes, v1 reads, v2-only PUT validation, and
  exact 409 conflict responses. Stale revisions cannot mutate the active row,
  and users remain isolated behind the existing one-active-plan constraint.
- Verified revision persistence and Route Handlers with 27 tests, migrated
  PGlite fixtures, TypeScript, ESLint, and whitespace checks.
- Completed Plan 3 Task 4 with immutable bounded history helpers, one labeled
  mutation boundary for planner actions, Program Profile history, Undo/Redo,
  keyboard shortcuts that ignore text-editing controls, and persistence that
  excludes history. Catalog reconciliation updates the present baseline
  without creating an Undo entry.
- Verified semantic history and planner state with 7 focused tests, TypeScript,
  and ESLint.
- Completed Plan 3 Task 5 with a revision-aware, debounced sync coordinator,
  acknowledged-snapshot suppression, abort/restart behavior, offline and
  retry state, explicit errors, and non-destructive 409 conflict handling.
- Added a persistent visible sync indicator and conflict dialog. Keep local is
  explicitly confirmed, Use server is one undoable history mutation, and
  Export both downloads timestamped local/server JSON copies without resolving
  the conflict. Hydration and catalog reconciliation remain outside Undo.
- Replaced the legacy silent v1 autosave boundary. Cloud writes stay disabled
  until migration is ready, while signed-out editing remains local-only.
- Verified sync, conflict UI, and store integration with 18 focused tests,
  TypeScript, and ESLint.
- Completed Plan 3 Task 6 with a responsive Program Profile editor for the
  NYUSH Core, required primary major, optional distinct second major, and
  multiple minors. Selectors exclude raw New York Bulletin programs, identify
  reviewed overlays, preview requirement groups, show before/after audit
  scope, and require acknowledgement for advisor-dependent combinations.
- Replaced the crowded degree preset control with a compact profile summary,
  while retaining mobile access through Plan actions. Unsaved edits require
  discard confirmation and native controls preserve keyboard behavior.
- Added the explicit v1 migration dialog. It preserves unresolved program IDs,
  supports backup export and cancellation, and cannot start cloud sync until
  a valid reviewed v2 plan has been persisted locally with a v1 backup.
- Verified Program Profile, migration, header, sync hook, and status UI with
  24 focused tests, TypeScript, and ESLint.
- Completed Plan 3 Task 7 by moving live placements to stable UUID identity,
  retaining official course code for existing engines, and recording optional
  source-scoped `catalogCourseId` plus bounded title snapshots. Move, remove,
  credits, grade, drag/drop, catalog, and detail actions now target placement
  or source identity rather than collapsing same-code Bulletin records.
- Planner derivation now exposes placement, catalog, and custom identity maps;
  missing cached detail leaves the placement visible and removable. New York
  records continue into validation by official code and selected credits.
- All live audits now derive their ordered program list from Program Profile.
  Progress and requirements identify Core/primary/second/minor roles and
  distinguish NYUSH Bulletin rules from reviewed overlays. Course detail also
  exposes automatic/manual allocation recipients and double-count context.
- Plan import/export now accepts and emits v2 while preserving v1 import
  compatibility. Verified the migration with 29 focused tests, TypeScript,
  and ESLint.
- Completed Plan 3 Task 8 safety gates: 69 focused migration/revision/offline/
  Undo/Profile tests passed; the complete repository passed 62 files and 499
  tests; ESLint, TypeScript, whitespace checks, and the Next.js production
  build all exited cleanly.
- One full-suite run observed a non-reproducible Sheet focus timing failure.
  The test passed alone, passed alongside the new migration/Profile sheets,
  and the complete 499-test rerun passed without code changes to focus logic.
- Began Plan 4 and completed Task 1 with strict course/requirement/program/other
  report contracts, bounded HTTPS-only evidence context, public/student DTO
  separation, the enforced six-state review graph, owner-withdrawal policy,
  and discriminated overlay allowlists that exclude source identity and audit
  fields. Verified with 17 policy/contract tests, TypeScript, and ESLint.
- Completed Plan 4 Task 2 with generated migration `0006`, indexed correction,
  public/internal message, append-only event, overlay, and notification tables.
  Actor references anonymize on user deletion while owner-scoped request
  children follow the request lifecycle.
- Added transaction-first repository operations for submission, owner reads,
  messages, withdrawal, maintainer transitions, compatible duplicate merges,
  one-time approved overlay application, and notification read state. Every
  mutation writes its audit event in the same transaction; student DTOs omit
  internal messages, private notes, and reviewer identity.
- Verified persistence and privacy with 5 PGlite workflow tests plus
  TypeScript and ESLint.
- Completed Plan 4 Task 3 with authenticated owner-scoped report list/create/
  detail/withdraw/message routes and notification list/read routes. Dynamic
  IDs use async Route Context, cross-owner misses are 404, all responses are
  private/no-store, and validation/rate conflicts use 400/409/429 contracts.
- Added separate per-user creation/message budgets with a deterministic
  in-memory adapter and database-counted runtime adapter. Notification bulk
  reads are capped at 100 owner IDs. Verified with 8 route/rate tests,
  TypeScript, and ESLint.
- Completed Plan 4 Task 4 with a typed admin-user gate, bounded inbox filters,
  transition, duplicate-merge, and apply Route Handlers. Apply re-reads the
  active release, verifies the report release and exact target, accepts only
  discriminated allowlisted patches, and then calls the atomic repository.
- Approval and application are distinct; mismatched report/overlay targets,
  stale releases, missing targets, invalid transitions, incompatible merges,
  and duplicate application return conflicts without inserting overlays.
  Verified admin/auth/repository behavior with 24 tests, TypeScript, ESLint.
- Completed Plan 4 Tasks 5-7: active catalog readers now compose typed reviewed
  overlays without mutating Bulletin snapshots, candidate releases supersede
  upstream-resolved corrections and block on missing/conflicting targets, and
  students have contextual reporting/history while maintainers have a review
  inbox with separate approval/application and private-note boundaries.
- Added owner-scoped notification UI with visible-page-only refresh, unread
  handling, and direct report history navigation. The Correction Hub focused
  gate passed 11 files/49 tests and the final repository gate passed 73 files/
  551 tests plus ESLint, TypeScript, and the Next.js production build.
- Began Phase 5, NYU Academic Glass, after completing all Correction Hub gates.

## Files created or modified

- `.planning/.active_plan`
- `.planning/2026-07-18-v0-2-implementation/task_plan.md`
- `.planning/2026-07-18-v0-2-implementation/findings.md`
- `.planning/2026-07-18-v0-2-implementation/progress.md`

## Error log

| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-07-18 | The complete baseline suite exceeded a 60-second command timeout | 1 | Re-ran with a monitored longer process; all 344 tests passed |
| 2026-07-18 | A PowerShell `rg` command used a Unix-style `src/lib/*.test.ts` argument and exited after the valid first search | 1 | Re-ran the second search with `rg -g '*.test.ts'` and obtained the complete constructor list |
| 2026-07-18 | Typecheck found existing typed program constructors missing the new output fields | 1 | Root cause identified: parsed output is intentionally strict; normalization and fixtures will emit the fields while schema defaults preserve old JSON input |
| 2026-07-18 | The first source-aware discovery implementation accepted `Graduate Programs` as the Shanghai program index | 1 | Replaced the broad suffix rule with the two authoritative Shanghai index identities; all 20 discovery tests passed |
| 2026-07-18 | Typecheck found four test discoveries missing required source metadata | 1 | Migrated each typed fixture explicitly to the Shanghai source contract and verified the affected suites |
| 2026-07-18 | Seven sync tests failed after the parser call changed to its source-aware options object | 1 | The failures all originated in the stale parser mock signature; migrated the mock to the production contract before rerunning the regression suite |
| 2026-07-18 | A broad patch context temporarily changed two unrelated normalization return expressions and produced syntax/type errors | 1 | Inspected the exact failing lines, restored the requirement-node and legacy course returns, then applied the catalog schema parse only at the source-record boundary |
| 2026-07-18 | Source validation tests passed but TypeScript did not retain the `Record` narrowing after `filter` | 1 | Added an explicit filter type predicate and reran both the test and type gates |
| 2026-07-18 | The first multi-source repository run rejected the authored Shanghai fixture because `offeringKnown: true` had no term | 1 | Corrected the fixture to include its known Fall term; the production schema correctly remained strict |
| 2026-07-18 | The all-school adapter matrix found Stern's intentional variable credit and Tandon's intentional missing-credit parser fixture incompatible with a fixed-credit publication assertion | 1 | Made the matrix validate positive credit bounds, gave the publishable Tandon adapter explicit credits, and retained missing-credit behavior through an isolated parser mutation |
| 2026-07-18 | A PowerShell inspection command used nested double quotes around an `rg` alternation and failed in the shell parser | 1 | Replaced it with PowerShell `Select-String` using separate literal patterns |
| 2026-07-18 | Active release reading compared JSON object serialization and rejected identical membership with a different database row order | 1 | Replaced order-sensitive serialization with exact key/value membership validation |
| 2026-07-18 | Production build could not fetch Geist and Geist Mono from Google Fonts in the restricted environment | 1 | Classified as the existing external font dependency; scheduled its removal in the already-approved local Academic Glass typography implementation |
| 2026-07-18 | Initial batch Route Handler mapped malformed JSON to catalog-unavailable 503 | 1 | Added an explicit safe invalid-JSON branch returning 400 without leaking parser details |
| 2026-07-18 | Typed-client URL test omitted the query contract's default undergraduate level | 1 | Updated the assertion to the canonical serialized query; implementation and server contract were already aligned |
| 2026-07-18 | A first full-suite invocation used a one-second shell timeout and was terminated before Vitest initialized | 1 | Re-ran with the bounded full-suite timeout; all 445 tests passed in 81.62 seconds |
| 2026-07-18 | Windows PowerShell `Start-Process` rejected duplicate case-insensitive PATH keys while launching the local server | 1 | Ran the production server in a managed foreground tool cell and terminated it after HTTP inspection |
| 2026-07-18 | First clean-font build emitted non-fatal PGlite URL/WASM teardown errors | 1 | Externalized `@electric-sql/pglite` and skipped local PGlite initialization during Next's production-build phase using a non-connecting node-postgres Drizzle dialect for Auth.js inspection |
| 2026-07-18 | A generic build-time database Proxy was rejected by Auth.js Drizzle adapter dialect inspection | 1 | Replaced it with a real node-postgres Drizzle object pointed at an unreachable loopback URL; the next build completed cleanly |
| 2026-07-18 | Local production catalog smoke returned 503 | 1 | Confirmed root cause is the intentionally unsynced/unpublished local catalog, retained no-store headers, and relied on passing route/repository success-path tests rather than performing an unauthorized live publication |
| 2026-07-18 | Four sync-hook tests timed out | 1 | Identified fake-timer `waitFor` polling as the cause, switched to real timers after advancing the debounce clock, and verified all hook states |
| 2026-07-18 | Updated acknowledged-snapshot behavior invalidated the old conflict setup | 1 | Changed the test to begin from the acknowledged server plan and then perform a local edit, matching the real conflict path |
| 2026-07-18 | Sync-status tests used an unavailable jest-dom matcher | 1 | Used native `textContent` assertions consistent with this repository's Vitest setup |
| 2026-07-18 | Program Profile draft reset triggered React's synchronous set-state-in-effect lint rule | 1 | Replaced the reset effect with a keyed editor boundary so each opening starts with a fresh draft structurally |
| 2026-07-18 | Two Program Profile tests overfit label/option query cardinality | 1 | Selected the second-major control by its current value and asserted the filtered candidate set across both eligible role selectors |
| 2026-07-18 | First Plan 3 full-suite run had one Sheet Escape focus assertion fail | 1 | Reproduced the test alone and with all new Profile sheets (both passed), then reran all 499 tests successfully; classified as a one-run timing fluctuation rather than changing correct focus behavior |
| 2026-07-18 | The first combined Correction Hub/full-suite command reached its 120-second shell window after the 49 focused tests passed | 1 | Re-ran the full suite alone with a bounded 240-second window; all 551 tests passed in 111.91 seconds |
