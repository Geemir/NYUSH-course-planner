# Findings: NYUSH Course Planner

## Requirements
- Read and explore the codebase.
- Explain the NYUSH course-planning tool's purpose, structure, behavior, and implementation.
- Do not modify existing application code.

## Research Findings
- The repository already contains many modified and untracked files; preserve them as user-owned work.
- The root `AGENTS.md` requires consulting the bundled Next.js guide before writing Next.js code. This task is currently read-only.
- The app is Next.js 16.2.9 + React 19.2.4 + TypeScript, with Tailwind 4, Base UI/shadcn components, dnd-kit, Zustand, Auth.js v5, Drizzle ORM, Postgres/PGlite, Zod, and Vitest.
- README describes a mature interactive four-year planner: drag/drop scheduling, prerequisite and offering validation, cross-list allocation, degree progress, study-away, feasibility analysis, per-user cloud sync, admin catalog/rule tooling, and Albert/AI import.
- The product remains usable signed out through Zustand/localStorage; authenticated NYU users gain database-backed plan sync.
- Main code areas: `src/app` routes/APIs, `src/components` UI, `src/store` persisted client facts, `src/lib` pure engines/server utilities, `src/db` schema/access, and `src/data` bundled seed/reference JSON.
- The catalog has about 48 curated courses according to README and uses database data with JSON fallback/seed; program and site definitions remain JSON-driven.
- `PlannerApp` is the client composition root: header controls, catalog, eight-semester drag/drop board, degree progress, feasibility, special rules, warnings, detail dialog, and import/export all meet here.
- Hydration is explicitly gated with `useSyncExternalStore` because the persisted Zustand state comes from localStorage.
- The persisted store keeps raw user facts only: placements, per-term study-away site, completed terms, active programs, custom course overrides, dismissed warnings, start year. Derived warnings/progress/feasibility are recomputed.
- Each course can be placed at most once. Re-placing moves it and preserves allocation/grade. Custom courses can shadow catalog courses without mutating the shared catalog.
- `CatalogProvider` renders immediately from bundled JSON, then fetches `/api/catalog`, validates the response, and swaps to DB data only if it contains valid courses; failure leaves the app functional offline.
- `PlanSync` begins only after authentication: GET remote snapshot, prefer it when present, otherwise optionally adopt a non-empty guest plan, then debounce PUT autosaves by 800 ms. Network failures intentionally preserve local behavior.
- The domain schema is compact and data-driven: programs contain requirement categories using `allOf`, `chooseN`, or `creditsFrom`; courses carry AND-of-OR prerequisites, offerings, sites, fulfillments, equivalences, and tags.
- Major programs compete for cross-listed courses; core/minor programs pass through. Allocation can be `auto`, a specific major, or `split` (consuming a double-count budget).
- `usePlanDerived` is the client-side orchestration layer: special-rule context → allocation → progress → warnings/lookups → feasibility. Pure engines remain separate from React state.
- Rule contexts precompile active DB rules into O(1) lookups: target-course equivalences and grade-gated same-term prerequisite exceptions.
- Allocation is deterministic and chronological. `auto` chooses the first active major (preset order) with remaining demand; `split` credits every matching major and increments the shared double-count count. The budget is the minimum limit among active majors, defaulting to 2.
- Progress distinguishes planned versus completed using the user's completed-semester markers. Program rollups weight credit pools as roughly four credits per course so large elective pools do not dominate the ring.
- `allOf` slots require exact courses or equivalences. `chooseN` and `creditsFrom` can count any effectively credited custom course, making user imports extensible without rewriting static pools.
- Validation emits stable, dismissible IDs for: missing/out-of-order prerequisites, wrong term, unavailable study-away site, overload (>18), underload (1–11), early capstone, and exceeded double-count budget.
- The 128-credit graduation total is independent of program-category completion, so the UI presents both overall credits and requirement satisfaction.
- Feasibility analysis derives missing exact requirements and greedily selects pool courses, closes over prerequisites, then schedules into uncompleted terms under offering/site/capstone constraints. It first honors the 18-credit cap, then retries with overload allowed to distinguish feasible from feasible-with-overload.
- The feasibility engine is intentionally heuristic, not an optimizer: it picks the first available pool/prerequisite option and earliest compatible term. A reported infeasibility can therefore reflect greedy choices rather than a proof that no schedule exists.
- Export/import uses a versioned Zod schema and safely drops unknown courses/programs. However, its placement schema currently omits `expectedGrade`, so expected grades are lost on JSON import even though they exist in `PlanSnapshot` and drive conditional rules.
- Actual bundled data currently has 52 courses (README says ~48), five programs (`core`, CS, IMA, Data Science, IMA minor), seven sites, and three tagged capstones.
- Degree presets intentionally avoid CS+DS together; CS/DS-shared courses therefore do not show a false major-allocation conflict unless both are manually activated.
- Auth.js uses database sessions through Drizzle. All identities are server-gated to `@nyu.edu`; admin role comes from either `ADMIN_EMAILS` or the stored user role.
- Database selection is environment-driven: hosted Postgres when `DATABASE_URL` is set, otherwise a singleton embedded PGlite database under `.pglite` for local development/tests.
- Tables cover standard Auth.js entities, one-or-more JSONB plan rows per user, shared JSONB course records with provenance/version columns, and JSONB special rules with active/draft status.
- Repository functions seed catalog and demo rules lazily when their tables are empty. Invalid catalog/rule JSONB rows are skipped on reads instead of crashing the whole response.
- `/api/plan` is authenticated and sanitizes every PUT through the same plan-import parser. `/api/catalog` is public and deliberately returns empty arrays with HTTP 200 on DB failure so the client retains its bundled fallback.
- All shared-catalog mutations, Albert imports, and rule management are server-admin-gated. Rule-authoring output enters a draft/approval queue; only active rules are exposed to student engines.
- The standalone `/api/parse-course` preview endpoint is public and invokes the paid DeepSeek-backed parser without authentication or visible rate limiting; this is an operational/cost-abuse risk.
- The supposedly dev-only console magic-link provider is included unconditionally in `authConfig`, including production. If deployed as-is, anyone with an `@nyu.edu` address can request a link whose secret is printed to production logs instead of emailed; this should be environment-gated before product use.
- Plan persistence is implemented as a read-then-insert/update MVP without a unique constraint on `userId`; concurrent first saves could create duplicate plan rows, and `getActivePlan` does not filter `isActive` despite the column name.
- Main planner journey: search/filter a catalog card → drag or choose a real-dated semester → optionally mark the term completed or study-away → open the course dialog to edit metadata, expected grade, or major allocation → resolve/dismiss warnings → inspect rings and requirement categories → run feasibility and optionally auto-fill suggestions.
- Semester cards expose 12/18-credit load feedback, completion state, study-away site, capstone affordances, and per-course warning/allocation/grade badges.
- Progress UI deliberately separates “planned” from “earned”: ring center and checklist coverage show the whole plan, while earned values depend on completed-term checkboxes.
- Warnings are globally sorted with errors first, can be acknowledged without deleting the underlying condition, and reappear in a separate restorable section while the condition persists.
- Course details are also the editing surface: user edits save as personal custom overrides, including modifications to bundled courses; deleting an override reverts to the shared version when one exists.
- Feasibility auto-fill mutates the plan by placing every suggested course with `auto` allocation; it does not ask for per-course confirmation.
- Performance risk: `usePlanDerived()` performs all engines including feasibility in each caller. It is invoked in every catalog card, every course chip, and nested progress rows, so the same nontrivial derivation is recomputed many times per state change instead of once in a shared provider/selector.
- Signed-out/student “Add course from Albert” calls the AI preview endpoint and stores the result only as a personal custom course in localStorage/account snapshot. The button/toast wording says “catalog,” which can be confused with the admin-managed shared catalog.
- Manual course editing supports credits, offerings, sites, prerequisites, equivalences, and requirement mappings. Unknown referenced course codes are warned about but intentionally saved.
- Admin has three content paths: live FOSE subject import, pasted-listing batch AI import, and manual/AI special-rule authoring. Course imports use preview/commit; rule drafts can be approved/rejected; manual rules can bypass draft review and activate immediately.
- The pasted-listing batch importer re-runs DeepSeek on “commit” rather than persisting the exact preview payload, doubling AI work and allowing preview/commit drift. The live Albert importer also calls the import function again, but a five-minute in-memory cache normally makes preview and immediate commit reuse the same result.
- Admin course deletion is immediate after a browser confirm and can remove a code still referenced by program JSON or existing user plans; clients then drop/ignore unknown placements only during import/merge, so referential drift is possible in the live shared catalog.
- AI parsing follows a sound “model proposes, deterministic code validates” boundary: response JSON is parsed, sites/requirement targets are allowlisted, and Zod validates the final object. Rule parsing similarly sanitizes structure and flags unknown codes for human review.
- Course-listing sanitization does not enforce official-code shape or catalog existence for prerequisite strings, and passes arbitrary model tags through; the schema keeps these harmless to execution, but low-quality/prompt-injected metadata can still enter a personal or shared course record.
- Albert integration is bounded and polite: public FOSE API, explicit user agent, 150 ms between detail calls, 80-detail/60-course caps, 20-second request timeouts, and five-minute cache. AI prerequisite enrichment is optional, batched once, code-shape sanitized, and fails soft.
- Live Albert facts are necessarily shallow: campus, term, credits, title/description and best-effort prerequisite codes; requirement fulfillments stay empty until curated. This is why the project calls it a spike rather than authoritative catalog synchronization.
- Automated tests are concentrated on pure/domain logic and repositories: data integrity, allocation, special rules, validation, progress, feasibility, listing splitting, Albert normalization, rule sanitization, and PGlite JSONB/catalog operations.
- There are no component/browser tests in the current Vitest configuration (`node` environment, `*.test.ts` only), so drag/drop, dialogs, hydration, Auth.js flows, API authorization, and admin UI integration depend mainly on build/type checks and manual testing.
- Verification so far: 7 test files / 72 tests pass; ESLint passes; Next production compilation, TypeScript, and static-page generation all complete successfully.
- After a successful build on Node 24.14.1, the process prints four `ERR_INVALID_ARG_TYPE` messages and intermittent PGlite WASM `Aborted()` messages while still exiting 0. The symptom reproduces with trace flags.
- Local bundle evidence points to PGlite initialization during Next build workers: PGlite 0.5.3's Emscripten loader converts a file URI to `new URL(...)` then passes it to `fs.readFileSync`; project code itself has no filesystem URL usage, and trace output locates the WASM abort inside the generated PGlite chunk.
- Working hypothesis (not yet a fix): Next/Turbopack's worker/VM realm creates a URL object that Node 24's filesystem brand check does not recognize as the host realm's URL. An older PGlite issue also documents static Next.js build incompatibility, and PGlite's own documentation emphasizes its single-process/single-connection limitation.
- A/B verification confirmed the failing boundary: the same production build with a temporary `DATABASE_URL` selects node-postgres, exits 0, and emits none of the URL/WASM errors. Thus the noisy post-build failure is specific to build-time local PGlite initialization, not application compilation or route generation.
- Final verification: tests 72/72 pass, ESLint exits 0, production build with node-postgres selection exits 0, and the worktree differs from its initial state only by the isolated `.planning/` exploration notes.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Follow entry points first, then domain/data flow | Produces a coherent model rather than a file-by-file inventory |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| None | N/A |
| Successful build emits post-build PGlite/URL errors | Reproduced with trace flags; isolating whether selecting the node-postgres path removes them |
| Build-time PGlite error source | Confirmed by identical build with temporary `DATABASE_URL`; node-postgres path is clean |

## Resources
- `AGENTS.md`
- `package.json`
- `README.md`
- `src/app/page.tsx`
- `src/components/PlannerApp.tsx`
- `src/store/plannerStore.ts`
- `src/hooks/usePlanDerived.ts`
- `src/lib/types.ts`
- `src/auth.ts`
- `src/db/schema.ts`
- `src/lib/repository.ts`
- `src/app/api/*`
