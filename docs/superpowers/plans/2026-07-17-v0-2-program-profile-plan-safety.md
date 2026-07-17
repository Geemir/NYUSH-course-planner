# Program Profile and Plan Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit NYUSH Program Profile for a primary major, optional second major, and minors; migrate saved plans to catalog-release-aware version 2 without dropping unresolved data; and make local/cloud persistence trustworthy through revision conflicts, visible sync state, backups, and bounded Undo.

**Architecture:** `ProgramProfile` becomes the sole persisted program-selection model while an ordered `activeProgramIds(profile)` adapter preserves existing deterministic engines. Plan v2 stores source-scoped course IDs beside official codes and the catalog release used when saved. The Zustand store remains local-first, records semantic snapshots in a bounded history, and sends optimistic-concurrency writes with a base revision. A sync coordinator exposes explicit saved/saving/offline/error/conflict states and never discards either side of a conflict.

**Tech Stack:** React 19, Next.js 16.2.9 Route Handlers, TypeScript 5, Zod 4, Zustand 5, Drizzle ORM, PostgreSQL/PGlite, Vitest 4, React Testing Library.

## Global Constraints

- Execute after the multi-source ingestion and query-catalog plans. Execute before Correction Hub, Academic Glass, and GA integration.
- Keep NYUSH Core always active. Require exactly one primary NYUSH Bulletin major; allow zero or one distinct second major and zero or more distinct minors when each is backed by either the NYUSH Bulletin or an explicit reviewed NYUSH overlay.
- Do not expose New York Bulletin degree programs directly. A cross-school program/minor is selectable only after a reviewed overlay supplies executable NYUSH-facing requirements and eligible profile roles.
- Keep the current degree engines deterministic. Adapt profile state into their existing ordered program-ID input instead of rewriting engine semantics here.
- Preserve every structurally valid placement, custom course, fulfillment fact, and unresolved program ID during migration. Never filter imports against a static bundled catalog before reconciliation.
- Create a local v1 backup before first successful migration and keep it until the user explicitly dismisses the migration notice or exports a v2 plan.
- Local edits are authoritative for responsiveness. Server sync is a durable copy with explicit optimistic concurrency, not a prerequisite for editing.
- Never auto-resolve a multi-device conflict by overwriting server or local state. Offer keep-local, use-server, and export-both actions.
- Undo covers plan mutations only; it does not undo login, server publication, Correction Hub decisions, or catalog refreshes.
- Follow red-green-refactor and stage only task-owned files.

---

## File Structure

### New domain and persistence files

- `src/lib/programProfile.ts`
- `src/lib/programProfile.test.ts`
- `src/lib/planMigration.ts`
- `src/lib/planMigration.test.ts`
- `src/store/planHistory.ts`
- `src/store/planHistory.test.ts`
- `src/hooks/usePlanSync.ts`
- `src/hooks/usePlanSync.test.tsx`

### New interface files

- `src/components/programs/ProgramProfileSheet.tsx`
- `src/components/programs/ProgramProfileSheet.test.tsx`
- `src/components/programs/ProgramProfileSummary.tsx`
- `src/components/programs/ProgramProfileMigrationDialog.tsx`
- `src/components/programs/ProgramProfileMigrationDialog.test.tsx`
- `src/components/layout/PlanSyncStatus.tsx`
- `src/components/layout/PlanSyncStatus.test.tsx`
- `src/components/layout/UndoButton.tsx`

### Existing files changed

- `src/lib/types.ts`
- `src/lib/planIO.ts`
- `src/lib/planIO.test.ts`
- `src/db/schema.ts`
- `drizzle/0005_plan_v2_revision.sql`
- `drizzle/meta/0005_snapshot.json`
- `drizzle/meta/_journal.json`
- `src/lib/repository.ts`
- `src/lib/repository.test.ts`
- `src/app/api/plan/route.ts`
- `src/app/api/plan/route.test.ts`
- `src/store/plannerStore.ts`
- `src/store/plannerStore.test.ts`
- `src/components/PlanSync.tsx`
- `src/components/layout/PlannerHeader.tsx`
- `src/components/layout/PlannerHeader.test.tsx`
- `src/components/planner/PlanDerivedProvider.tsx`
- `src/hooks/usePlanDerived.ts`
- `src/hooks/usePlanDerived.test.tsx`
- `src/components/progress/RequirementChecklist.tsx`
- `src/components/progress/ProgressRings.tsx`
- `src/components/dialogs/CourseDetailDialog.tsx`
- `src/components/dialogs/CourseDetailDialog.test.tsx`
- `src/components/PlannerApp.tsx`

---

### Task 1: Define the structured NYUSH Program Profile

**Files:**
- Create: `src/lib/programProfile.ts`
- Create: `src/lib/programProfile.test.ts`
- Modify: `src/lib/types.ts`

**Interfaces:**

```ts
export const ProgramProfileSchema = z.object({
  coreProgramId: z.string().min(1),
  primaryMajorId: z.string().min(1),
  secondMajorId: z.string().min(1).nullable().default(null),
  minorIds: z.array(z.string().min(1)).default([]),
});

export type ProgramProfile = z.infer<typeof ProgramProfileSchema>;

export function validateProgramProfile(
  profile: ProgramProfile,
  programs: CatalogProgram[],
): ProgramProfileValidation;

export function activeProgramIds(profile: ProgramProfile): string[];
```

- [ ] **Step 1: Write failing semantic validation tests**

Test that validation requires the configured Core and a NYUSH Bulletin primary major; recognizes NYUSH Bulletin or reviewed-overlay programs only in their declared roles; rejects every raw New York Bulletin program; rejects duplicate primary/second majors and a major used as a minor; deduplicates minors in first-seen order; and preserves unresolved IDs in diagnostics instead of deleting them.

Run:

```powershell
npm.cmd test -- src/lib/programProfile.test.ts --maxWorkers=1
```

Expected: FAIL because the profile module does not exist.

- [ ] **Step 2: Implement structural and catalog-aware validation**

Return:

```ts
interface ProgramProfileValidation {
  status: "valid" | "needs-resolution";
  normalized: ProgramProfile;
  issues: Array<{
    field: "core" | "primaryMajor" | "secondMajor" | "minors";
    code: "missing" | "wrong-kind" | "duplicate" | "unresolved";
    programId: string | null;
    message: string;
  }>;
}
```

Structural parsing must not require catalog data. Catalog-aware validation happens after bootstrap loads. Eligibility is determined by explicit `auditAuthority` and `eligibleProfileRoles` metadata, never by school/campus name matching.

- [ ] **Step 3: Implement the engine adapter**

`activeProgramIds` returns an ordered array containing Core, primary major, optional second major, then every minor, with duplicates removed and original semantic order retained. Add a test proving engine ordering is stable.

- [ ] **Step 4: Run tests and commit**

```powershell
npm.cmd test -- src/lib/programProfile.test.ts --maxWorkers=1
git add src/lib/programProfile.ts src/lib/programProfile.test.ts src/lib/types.ts
git commit -m "feat(programs): define NYUSH Program Profile"
```

Expected: PASS.

---

### Task 2: Define plan v2 and a lossless v1 migration/reconciliation pipeline

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/planMigration.ts`
- Create: `src/lib/planMigration.test.ts`
- Modify: `src/lib/planIO.ts`
- Modify: `src/lib/planIO.test.ts`

**Plan v2 contract:**

```ts
export interface PlanPlacementV2 extends Placement {
  placementId: string;              // opaque stable move/remove/Undo identity
  courseId: string;                 // official code for engine compatibility
  catalogCourseId?: string;         // source-scoped stable ID for Bulletin records
  titleSnapshot?: string;           // recovery label while a record is unavailable
}

export interface PlanSnapshotV2 {
  version: 2;
  catalogReleaseId: string | null;
  placements: PlanPlacementV2[];
  studyAway: Partial<Record<SemesterId, string>>;
  completedSemesters: SemesterId[];
  programProfile: ProgramProfile;
  unresolvedProgramIds: string[];
  customCourses: Course[];
  fulfillmentFacts: FulfillmentFact[];
  dismissedWarnings: string[];
  startYear: number;
}

export type PersistedPlanSnapshot = PlanSnapshotV1 | PlanSnapshotV2;
```

- [ ] **Step 1: Write failing discriminated parsing tests**

Prove that `parsePlanDocument` accepts valid v1 and v2 JSON, rejects unknown versions, retains unknown course/program references, validates custom courses individually, keeps structurally valid placements even before the catalog loads, and returns issues rather than silently defaulting to every known program.

- [ ] **Step 2: Implement structural parsing without static maps**

Remove `COURSES_BY_ID` and `PROGRAMS_BY_ID` from `planIO.ts`. Export:

```ts
export function parsePlanDocument(text: string): PersistedPlanSnapshot;
export function exportPlan(snapshot: PlanSnapshotV2): string;
```

`downloadPlan` may remain a browser wrapper around `exportPlan`.

- [ ] **Step 3: Write failing v1-to-v2 migration tests**

Cover:

- one Core + one major + minors maps automatically;
- two majors map by existing order to primary/second and emit a confirmation notice;
- more than two majors, no major, duplicate IDs, or unknown kinds produce `needs-resolution` while preserving all IDs;
- known course codes map to stable IDs only when exactly one active-release record matches;
- duplicate cross-source codes remain unresolved rather than selecting arbitrarily;
- all placements, study-away terms, completion flags, custom courses, facts, warnings, and start year survive unchanged.

- [ ] **Step 4: Implement migration and reconciliation**

Export:

```ts
export interface PlanMigrationResult {
  snapshot: PlanSnapshotV2;
  status: "ready" | "needs-resolution";
  issues: PlanMigrationIssue[];
}

export function migratePlanV1(
  input: PlanSnapshotV1,
  bootstrap: CatalogBootstrapResponse,
  cachedCourses: CatalogCourseRecord[],
): PlanMigrationResult;

export function reconcilePlanV2(
  input: PlanSnapshotV2,
  bootstrap: CatalogBootstrapResponse,
  cachedCourses: CatalogCourseRecord[],
): PlanMigrationResult;
```

Keep unresolved legacy program IDs in `unresolvedProgramIds`. For an unresolved placement, keep official code and title snapshot with no fabricated stable ID. Generate each legacy `placementId` deterministically from the v1 snapshot fingerprint, original placement index, course code, and semester. Add a test proving repeated/interrupted migration produces byte-identical v2 output. New interactive placements use `crypto.randomUUID()`.

- [ ] **Step 5: Add backup-key behavior tests**

Define keys:

```ts
export const PLAN_V1_BACKUP_KEY = "nyush-planner-v1-backup";
export const PLAN_V2_STORAGE_KEY = "nyush-planner-v2";
```

The migration helper must write the original v1 JSON to the backup key before writing v2. Corrupt v1 data must not overwrite an existing valid backup.

- [ ] **Step 6: Run tests and commit**

```powershell
npm.cmd test -- src/lib/planIO.test.ts src/lib/planMigration.test.ts --maxWorkers=1
git add src/lib/types.ts src/lib/planIO.ts src/lib/planIO.test.ts src/lib/planMigration.ts src/lib/planMigration.test.ts
git commit -m "feat(plans): migrate snapshots without data loss"
```

Expected: PASS; no static catalog filtering remains in import parsing.

---

### Task 3: Add revision-aware plan persistence and conflict responses

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0005_plan_v2_revision.sql`
- Create: `drizzle/meta/0005_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/repository.test.ts`
- Modify: `src/app/api/plan/route.ts`
- Create: `src/app/api/plan/route.test.ts`

**Persistence contract:**

```ts
interface StoredPlanEnvelope {
  snapshot: PersistedPlanSnapshot;
  revision: number;
  updatedAt: string;
}

interface SavePlanRequest {
  snapshot: PlanSnapshotV2;
  baseRevision: number | null;
}

type SavePlanResult =
  | { status: "saved"; plan: StoredPlanEnvelope }
  | { status: "conflict"; server: StoredPlanEnvelope };
```

- [ ] **Step 1: Write failing repository concurrency tests**

Test first insert at revision 1, successful update with matching base revision, revision increment, stale update returning the server envelope without mutation, user isolation, active-plan uniqueness, a v1 row read verbatim at revision 1, and replacement of that row only after a matching-revision v2 save.

- [ ] **Step 2: Add `revision` to the schema and generate migration**

Add `revision integer not null default 1` to `plan`. Run:

```powershell
npm.cmd run db:generate -- --name plan_v2_revision
```

Expected: `0005_plan_v2_revision.sql` after Plan 1's `0004`; update ordinal references if Drizzle generates a different safe next number.

- [ ] **Step 3: Implement compare-and-swap repository writes**

For existing rows, update where `userId`, `isActive = true`, and `revision = baseRevision`, setting `revision = revision + 1`. If zero rows update, read and return the current server plan as a conflict. Do not use last-write-wins.

- [ ] **Step 4: Write failing Route Handler tests**

Test unauthenticated `401`, invalid body `400`, first save `200`, matched update `200`, stale update `409`, and the exact conflict payload using a complete `serverEnvelope` fixture:

```ts
expect(await response.json()).toEqual({
  error: "revision_conflict",
  server: serverEnvelope,
});
```

- [ ] **Step 5: Implement GET/PUT envelopes**

GET returns `StoredPlanEnvelope | null` and may contain a structurally valid v1 or v2 snapshot. PUT accepts only `SavePlanRequest` with `PlanSnapshotV2Schema`; do not accept v1 on PUT. Keep migration client-side so the user sees resolution issues and receives a local v1 backup before cloud persistence.

- [ ] **Step 6: Run migration, repository, and route tests; commit**

```powershell
npm.cmd test -- src/lib/repository.test.ts src/app/api/plan/route.test.ts --maxWorkers=1
git add src/db/schema.ts drizzle src/lib/repository.ts src/lib/repository.test.ts src/app/api/plan/route.ts src/app/api/plan/route.test.ts
git commit -m "feat(plans): prevent stale cloud overwrites"
```

Expected: PASS, including a migrated database fixture.

---

### Task 4: Add bounded semantic Undo to planner state

**Files:**
- Create: `src/store/planHistory.ts`
- Create: `src/store/planHistory.test.ts`
- Modify: `src/store/plannerStore.ts`
- Create: `src/store/plannerStore.test.ts`
- Create: `src/components/layout/UndoButton.tsx`

**History contract:**

```ts
interface PlanHistory<T> {
  past: Array<{ label: string; snapshot: T }>;
  present: T;
  future: Array<{ label: string; snapshot: T }>;
}

const PLAN_HISTORY_LIMIT = 30;
```

- [ ] **Step 1: Write failing pure history tests**

Test push, undo, redo, cap at 30, no-op mutation suppression, redo clearing after a new mutation, label preservation, and immutability.

- [ ] **Step 2: Implement pure history helpers**

Export `createHistory`, `recordHistory`, `undoHistory`, and `redoHistory`. Compare plan snapshots with the existing stable serialization helper or a deterministic JSON representation; do not include transient sync state in equality.

- [ ] **Step 3: Write failing planner-store mutation tests**

Every user-visible plan mutation must create one semantic history entry: add/move/remove course, change credits/grade/allocation, edit Program Profile, study away, complete semester, facts, warnings, start year, import, and reset. Hydration, cloud acknowledgement, catalog cache changes, and sync-status changes must create none.

- [ ] **Step 4: Refactor store actions through one mutation boundary**

Add `applyPlanMutation(label, recipe)` and route all plan-changing actions through it. Expose `undo`, `redo`, `canUndo`, `canRedo`, `undoLabel`, and `redoLabel`. Persist only the present snapshot, not history, across reloads.

- [ ] **Step 5: Implement the accessible Undo control**

`UndoButton` uses the existing Button and Lucide `Undo2` icon, has `aria-label` including the current label, disables when unavailable, and leaves Redo available through keyboard shortcut and later menu placement. Bind `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z` only when focus is not in a text-editing control.

- [ ] **Step 6: Run tests and commit**

```powershell
npm.cmd test -- src/store/planHistory.test.ts src/store/plannerStore.test.ts --maxWorkers=1
git add src/store/planHistory.ts src/store/planHistory.test.ts src/store/plannerStore.ts src/store/plannerStore.test.ts src/components/layout/UndoButton.tsx
git commit -m "feat(planner): add bounded plan Undo"
```

Expected: PASS; hydration does not pollute history.

---

### Task 5: Replace silent autosave with an explicit sync coordinator

**Files:**
- Create: `src/hooks/usePlanSync.ts`
- Create: `src/hooks/usePlanSync.test.tsx`
- Modify: `src/components/PlanSync.tsx`
- Create: `src/components/layout/PlanSyncStatus.tsx`
- Create: `src/components/layout/PlanSyncStatus.test.tsx`

**Sync state:**

```ts
export type PlanSyncState =
  | { status: "local-only"; message: string }
  | { status: "saving"; baseRevision: number | null }
  | { status: "saved"; revision: number; savedAt: string }
  | { status: "offline"; pending: true; message: string }
  | { status: "error"; pending: true; message: string }
  | { status: "conflict"; local: PlanSnapshotV2; server: StoredPlanEnvelope };
```

- [ ] **Step 1: Write failing sync state-machine tests**

Use fake timers/deferred fetches to cover debounce, abort/restart, successful revision update, offline pending state, retry on `online`, server error, unauthenticated local-only mode, conflict preservation, and no save while migration needs resolution.

- [ ] **Step 2: Implement `usePlanSync`**

Debounce plan writes, serialize one in-flight save at a time, and queue the latest local snapshot. Store the last acknowledged revision outside Undo history. Never catch and discard a failure.

- [ ] **Step 3: Replace `PlanSync` internals**

Keep `PlanSync` as the composition boundary: load server/local state, run migration/reconciliation after bootstrap, hydrate the store once, then start the coordinator. Ensure React Strict Mode does not duplicate the initial migration or write.

- [ ] **Step 4: Implement visible status and conflict actions**

`PlanSyncStatus` shows Saved, Saving, Offline - changes kept locally, Could not sync, or Conflict. Conflict dialog actions:

- Keep local: retry with the current server revision only after explicit confirmation.
- Use server: replace the plan through one labeled history mutation so it is undoable.
- Export both: download two timestamped JSON files without resolving.

- [ ] **Step 5: Run tests and commit**

```powershell
npm.cmd test -- src/hooks/usePlanSync.test.tsx src/components/layout/PlanSyncStatus.test.tsx --maxWorkers=1
git add src/hooks/usePlanSync.ts src/hooks/usePlanSync.test.tsx src/components/PlanSync.tsx src/components/layout/PlanSyncStatus.tsx src/components/layout/PlanSyncStatus.test.tsx
git commit -m "feat(plans): surface sync and conflict state"
```

Expected: PASS; no autosave failure is silent.

---

### Task 6: Build the Program Profile editor and migration-resolution experience

**Files:**
- Create: `src/components/programs/ProgramProfileSheet.tsx`
- Create: `src/components/programs/ProgramProfileSheet.test.tsx`
- Create: `src/components/programs/ProgramProfileSummary.tsx`
- Create: `src/components/programs/ProgramProfileMigrationDialog.tsx`
- Create: `src/components/programs/ProgramProfileMigrationDialog.test.tsx`
- Modify: `src/components/layout/PlannerHeader.tsx`
- Modify: `src/components/layout/PlannerHeader.test.tsx`

- [ ] **Step 1: Write failing Program Profile interaction tests**

Cover opening from the header summary, required NYUSH primary major, optional second major, multiple minors, duplicate prevention, removing the second major, unsaved-change confirmation, searchable requirement previews, before/after progress impact, combination warnings, mobile sheet behavior, keyboard navigation, zero raw New York Bulletin programs in selectors, and a reviewed cross-school minor shown with a `Reviewed planner overlay` badge/source explanation.

- [ ] **Step 2: Implement the responsive editor**

Use existing Sheet, Select/Command-style primitives, Button, and Lucide icons. Sections are Core Curriculum (read-only/always active), Primary major, Second major (optional), and Minors. Primary major lists only NYUSH Bulletin majors. Second major/minor lists may also include reviewed-overlay records whose declared roles permit selection, clearly badged and sourced. Each selection exposes its requirement preview and an impact summary computed from current placements. Confirmed deterministic policy violations disable Save; advisor-dependent or unresolved combinations remain savable only with clear guidance and acknowledgement, without claiming an official audit.

- [ ] **Step 3: Replace the crowded header degree selector**

Render `ProgramProfileSummary` as a compact button such as `Computer Science + 1 major + 2 minors`. The button opens the editor; do not fit all selectors directly into the header.

- [ ] **Step 4: Write failing migration-dialog tests**

Test automatic-ready confirmation, ambiguous primary/second selection, unknown program preservation, Cancel retaining v1/local state, Continue writing v2 only after valid resolution, backup/export actions, focus trapping, and no cloud save before resolution.

- [ ] **Step 5: Implement migration resolution**

Explain that the planner structure changed, list preserved unresolved selections, require a primary major, and let the user classify at most one second major plus minors. Keep unknown IDs visible under `Needs review`; never silently remove them.

- [ ] **Step 6: Run component tests and commit**

```powershell
npm.cmd test -- src/components/programs src/components/layout/PlannerHeader.test.tsx --maxWorkers=1
git add src/components/programs src/components/layout/PlannerHeader.tsx src/components/layout/PlannerHeader.test.tsx
git commit -m "feat(programs): add profile editor and migration review"
```

Expected: PASS; selectors contain only NYUSH programs of the correct kind.

---

### Task 7: Wire Program Profile and stable placement identity through planner derivation

**Files:**
- Modify: `src/components/planner/PlanDerivedProvider.tsx`
- Modify: `src/hooks/usePlanDerived.ts`
- Modify: `src/hooks/usePlanDerived.test.tsx`
- Modify: `src/components/progress/RequirementChecklist.tsx`
- Modify: `src/components/progress/ProgressRings.tsx`
- Modify: `src/components/dialogs/CourseDetailDialog.tsx`
- Modify: `src/components/dialogs/CourseDetailDialog.test.tsx`
- Modify: `src/components/PlannerApp.tsx`
- Modify: `src/store/plannerStore.ts`

- [ ] **Step 1: Write failing derived-state compatibility tests**

Assert that a profile maps to Core, primary, second, and minors in order; removing a program removes only its derived audit; a New York study-away placement is passed to engines by official code/selected credits; two same-code records remain distinct in planner state by `catalogCourseId`; and missing cached detail does not remove the placement.

- [ ] **Step 2: Replace direct `activePrograms` reads**

All engines and progress components receive `activeProgramIds(programProfile)`. Remove legacy degree presets from live state. Keep a temporary v1 migration type only in `planMigration.ts`.

- [ ] **Step 3: Update placement actions**

When adding a Bulletin course, persist a new UUID `placementId`, `courseId: record.code`, `catalogCourseId: record.stableId`, and a bounded title snapshot. When adding a custom course, persist `placementId` but omit `catalogCourseId`. Move/remove actions identify the placement by `placementId`; do not collapse same-code cross-source records.

- [ ] **Step 4: Add requirement explanation context**

Group progress separately for Core, primary major, second major, and every minor. Within each group distinguish completed, planned, remaining, manually confirmed, and unresolved work. Requirement labels must identify whether a result comes from NYUSH Bulletin rules or a reviewed overlay. For New York courses without mapping, show `Not currently mapped to an NYUSH requirement` rather than implying a negative official ruling.

Course Detail and allocation controls must expose the current automatic allocation, deterministic double-count budget where known, which programs receive credit, why an allocation is ambiguous, and manual assignment to one or both programs only when the active rule permits it. Add focused tests for each state and keep advisor-dependent uncertainty explicit.

- [ ] **Step 5: Run derived and regression tests, then commit**

```powershell
npm.cmd test -- src/hooks/usePlanDerived.test.tsx src/components/progress/RequirementChecklist.test.tsx src/components/dialogs/CourseDetailDialog.test.tsx src/store/plannerStore.test.ts --maxWorkers=1
git add src/components/planner/PlanDerivedProvider.tsx src/hooks/usePlanDerived.ts src/hooks/usePlanDerived.test.tsx src/components/progress/RequirementChecklist.tsx src/components/progress/ProgressRings.tsx src/components/dialogs/CourseDetailDialog.tsx src/components/dialogs/CourseDetailDialog.test.tsx src/components/PlannerApp.tsx src/store/plannerStore.ts
git commit -m "refactor(planner): derive audits from Program Profile"
```

Expected: PASS; existing engine test expectations remain unchanged for equivalent v1 selections.

---

### Task 8: Verify migration, conflict, offline, and Undo safety

**Files:**
- Modify only if verification finds a defect: files owned by Tasks 1-7.

- [ ] **Step 1: Run focused safety suites**

```powershell
npm.cmd test -- src/lib/programProfile.test.ts src/lib/planMigration.test.ts src/lib/planIO.test.ts src/lib/repository.test.ts src/app/api/plan/route.test.ts src/store src/hooks/usePlanSync.test.tsx src/components/programs --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 2: Run all repository gates**

```powershell
npm.cmd test -- --maxWorkers=1
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
```

Expected: all exit 0.

- [ ] **Step 3: Rehearse v1 migration variants**

Import fixtures containing one major, double major, multiple minors, unknown program IDs, same-code cross-source courses, variable credits, custom courses, and facts. Verify byte-equivalent export of preserved unknown fields where the schema permits, creation of `nyush-planner-v1-backup`, and no server PUT before confirmation.

- [ ] **Step 4: Rehearse conflict and offline recovery**

Open two browser sessions against one test user. Save in A, edit stale state in B, and confirm B receives Conflict without losing either plan. Disable network, edit three actions, undo one, reload, re-enable network, and confirm the remaining local edits sync with a new revision.

- [ ] **Step 5: Verify accessible interaction**

By keyboard only, edit primary/second/minors, close/reopen the sheet, undo/redo, inspect sync status, and resolve/export a conflict. Confirm status is not color-only and live announcements are polite rather than repeated on every keystroke.

---

## Completion Criteria

- Program Profile expresses Core, one NYUSH Bulletin primary major, an optional distinct second major, and minors; second/minor exceptions require explicit reviewed NYUSH overlay records and raw New York Bulletin programs never appear.
- Existing engines consume a stable derived program-ID list and retain equivalent calculations.
- Plan v2 records catalog release and source-scoped course identity without losing official codes.
- v1 migration creates a backup, preserves unresolved data, and requires explicit resolution when ambiguous.
- Server saves use revisions and return a non-destructive `409` conflict.
- Local editing works offline; save/offline/error/conflict state is visible.
- Undo/redo covers semantic plan mutations, is bounded, and excludes hydration/sync noise.
- Migration, repository, route, store, component, lint, typecheck, build, keyboard, and offline/conflict checks pass.

## Handoff to the Next Plan

After this plan is complete, execute `2026-07-17-v0-2-correction-hub.md`. Correction requests can then reference stable courses, structured programs, catalog releases, and plan revisions safely.
