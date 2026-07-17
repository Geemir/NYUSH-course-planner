# Correction Hub and Reviewed Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let students report catalog or planner-requirement issues in context, track their own reports, and let authorized planner maintainers review, discuss, approve, and apply auditable corrections as overlays without mutating archived Bulletin source truth.

**Architecture:** Correction requests, messages, status events, overlays, and in-app notifications are separate persistence records. Student APIs are owner-scoped; admin APIs reuse the existing `requireAdmin` boundary and enforce a strict transition graph. Approval is a review decision, while application is a separate transactional action that creates a field-allowlisted overlay, event, and notification. Active-release readers compose raw normalized records with applicable overlays, and future source releases re-evaluate overlays rather than rewriting source snapshots.

**Tech Stack:** Next.js 16.2.9 Route Handlers, React 19, TypeScript 5, Zod 4, Drizzle ORM, PostgreSQL/PGlite, Vitest 4, React Testing Library, existing Radix/Base UI primitives and Lucide icons.

## Global Constraints

- Execute after multi-source ingestion, query discovery, and Program Profile/plan safety. Execute before Academic Glass and GA integration.
- This is a planner-maintainer workflow, not an official NYU advising, registration, petition, or degree-approval system. State that boundary in submission, detail, and admin surfaces.
- Never modify archived source documents or normalized source snapshots when applying a correction.
- Keep approval and application distinct. An approved request has no product effect until an authorized maintainer applies a valid overlay.
- Restrict overlay fields through explicit schemas. Never accept arbitrary JSON Patch paths from a client.
- Owner-scoped students may see only their own requests/messages/notifications. Admin access always passes `requireAdmin`.
- v0.2 supports in-app notifications only: no email delivery, file attachments, public comments, voting, or automated official submission.
- Evidence accepts optional HTTPS URLs only. Strip/escape untrusted text on display; never render report text as HTML.
- Apply reasonable per-user rate and size limits at the route boundary, and record every state transition.
- Follow red-green-refactor and stage only task-owned files.

---

## File Structure

### New correction domain and persistence files

- `src/lib/corrections/types.ts`
- `src/lib/corrections/types.test.ts`
- `src/lib/corrections/policy.ts`
- `src/lib/corrections/policy.test.ts`
- `src/lib/corrections/repository.ts`
- `src/lib/corrections/repository.test.ts`
- `src/lib/corrections/overlays.ts`
- `src/lib/corrections/overlays.test.ts`
- `src/db/schema.ts`
- `drizzle/0006_correction_hub.sql`
- `drizzle/meta/0006_snapshot.json`
- `drizzle/meta/_journal.json`

### New student/admin APIs

- `src/app/api/corrections/route.ts`
- `src/app/api/corrections/[id]/route.ts`
- `src/app/api/corrections/[id]/messages/route.ts`
- `src/app/api/corrections/correctionRoutes.test.ts`
- `src/app/api/notifications/route.ts`
- `src/app/api/admin/corrections/route.ts`
- `src/app/api/admin/corrections/[id]/transition/route.ts`
- `src/app/api/admin/corrections/[id]/merge/route.ts`
- `src/app/api/admin/corrections/[id]/apply/route.ts`
- `src/app/api/admin/corrections/adminCorrectionRoutes.test.ts`

### New student/admin components

- `src/components/corrections/ReportIssueDialog.tsx`
- `src/components/corrections/ReportIssueDialog.test.tsx`
- `src/components/corrections/MyReportsSheet.tsx`
- `src/components/corrections/MyReportsSheet.test.tsx`
- `src/components/corrections/CorrectionStatusTimeline.tsx`
- `src/components/corrections/NotificationMenu.tsx`
- `src/components/admin/AdminCorrections.tsx`
- `src/components/admin/AdminCorrections.test.tsx`

### Existing integration files changed

- `src/lib/catalog/searchRepository.ts`
- `src/lib/catalog/searchRepository.test.ts`
- `src/lib/catalogRepository.ts`
- `src/lib/bulletin/syncAll.ts`
- `src/components/dialogs/CourseDetailDialog.tsx`
- `src/components/dialogs/CourseDetailDialog.test.tsx`
- `src/components/progress/RequirementChecklist.tsx`
- `src/components/progress/RequirementChecklist.test.tsx`
- `src/components/layout/PlannerHeader.tsx`
- `src/components/layout/PlannerHeader.test.tsx`
- `src/app/admin/page.tsx`

---

### Task 1: Define correction contracts, status transitions, and overlay allowlists

**Files:**
- Create: `src/lib/corrections/types.ts`
- Create: `src/lib/corrections/types.test.ts`
- Create: `src/lib/corrections/policy.ts`
- Create: `src/lib/corrections/policy.test.ts`

**Contracts:**

```ts
export const CorrectionStatusSchema = z.enum([
  "submitted",
  "in_review",
  "needs_information",
  "approved",
  "rejected",
  "applied",
]);

export const CorrectionTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("course"), stableId: z.string() }),
  z.object({ kind: z.literal("requirement"), programId: z.string(), requirementId: z.string() }),
  z.object({ kind: z.literal("program"), programId: z.string() }),
  z.object({ kind: z.literal("other"), area: z.string().min(1).max(80) }),
]);

export const CreateCorrectionRequestSchema = z.object({
  target: CorrectionTargetSchema,
  issueType: z.enum([
    "incorrect_course_information",
    "missing_course",
    "incorrect_nyush_requirement",
    "nyush_fulfillment_review",
    "duplicate_crosslist_equivalency",
    "other_catalog_problem",
  ]),
  catalogReleaseId: z.string().nullable(),
  context: z.object({
    sourceId: z.string().optional(),
    sourceSnapshotId: z.string().optional(),
    schoolName: z.string().max(160).optional(),
    sourceUrl: z.string().url().refine((url) => url.startsWith("https://")).optional(),
    displayedValue: z.string().max(4000).optional(),
  }),
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(20).max(4000),
  suggestedCorrection: z.string().trim().max(4000).optional(),
  evidenceUrl: z.string().url().refine((url) => url.startsWith("https://")).optional(),
});
```

- [ ] **Step 1: Write failing strict contract tests**

Test every target and issue-type variant, length boundaries, HTTPS evidence/source URLs, release and source-snapshot capture, displayed-value limits, unknown-key rejection, and serialization without HTML interpretation.

Run:

```powershell
npm.cmd test -- src/lib/corrections/types.test.ts --maxWorkers=1
```

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Implement contracts and public DTOs**

Separate database rows from student/admin DTOs. Student DTOs must not expose internal reviewer IDs, private notes, or other users. Admin DTOs may expose audit metadata but never session/auth secrets.

- [ ] **Step 3: Write failing transition-policy tests**

Allowed transitions:

```ts
const ALLOWED_TRANSITIONS = {
  submitted: ["in_review", "rejected"],
  in_review: ["needs_information", "approved", "rejected"],
  needs_information: ["in_review", "rejected"],
  approved: ["applied", "in_review"],
  rejected: ["in_review"],
  applied: [],
} as const;
```

Assert that students can withdraw only their own submitted/needs-information requests; withdrawal sets a separate `withdrawnAt` terminal marker and event without inventing a seventh review status; only admins can run review transitions; applied is terminal; and every transition requires a public reason where the student needs context.

- [ ] **Step 4: Implement transition and overlay policies**

Expose `assertCorrectionTransition`, `canStudentWithdraw`, and typed overlay input schemas. Allow only:

- course: title, description, min/max credits, attributes, prerequisite display text, cross-list metadata;
- requirement: reviewed fulfillment mapping/exclusion or explanatory note;
- program: requirement explanatory note/source reference; or a fully validated reviewed program record with explicit `eligibleProfileRoles`, executable NYUSH-facing requirements, and supporting source URLs.

Do not allow stable ID, source ID, raw snapshot ID, ownership, status, or audit timestamps to be patched.

- [ ] **Step 5: Run tests and commit**

```powershell
npm.cmd test -- src/lib/corrections/types.test.ts src/lib/corrections/policy.test.ts --maxWorkers=1
git add src/lib/corrections
git commit -m "feat(corrections): define review and overlay policy"
```

Expected: PASS.

---

### Task 2: Add correction, event, message, overlay, and notification persistence

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0006_correction_hub.sql`
- Create: `drizzle/meta/0006_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Create: `src/lib/corrections/repository.ts`
- Create: `src/lib/corrections/repository.test.ts`

**Schema contract:**

```text
correctionRequest(id PK, userId FK, targetKind, targetData, issueType,
  catalogReleaseId, contextData,
  title, description, suggestedCorrection, evidenceUrl, status,
  assignedTo, duplicateOfId, withdrawnAt, createdAt, updatedAt, closedAt)
correctionMessage(id PK, requestId FK, authorUserId FK, visibility,
  body, createdAt)
correctionEvent(id PK, requestId FK, actorUserId FK, eventType,
  fromStatus, toStatus, publicNote, privateNote, metadata, createdAt)
catalogOverlay(id PK, requestId FK UNIQUE, targetKind, targetKey,
  patchType, patchData, sourceReleaseId, status, appliedBy, appliedAt,
  supersededAt, createdAt)
notification(id PK, userId FK, kind, requestId FK, title, body,
  readAt, createdAt)
```

- [ ] **Step 1: Write failing PGlite repository tests**

Cover creation plus initial event, owner-scoped listing/detail, cursor pagination, student message, internal/admin message visibility, withdrawal, admin transition, audit immutability, application transaction, duplicate-apply rejection, notification creation/read, and cascade/retention behavior.

- [ ] **Step 2: Add tables and indexes**

Add indexes for owner/status/updated time, admin status/created time, messages by request/time, events by request/time, active overlays by target key, and unread notifications by user. Use `onDelete: cascade` only for user-owned request children; preserve overlays/events according to existing user deletion policy by anonymizing actor IDs if required rather than losing audit history.

- [ ] **Step 3: Generate and review migration**

Run:

```powershell
npm.cmd run db:generate -- --name correction_hub
```

Expected: ordered migration after `0005`. Review SQL constraints and indexes; do not hand-edit generated metadata JSON.

- [ ] **Step 4: Implement transaction-first repository operations**

Export:

```ts
createCorrection(db, userId, input): Promise<StudentCorrectionDetail>;
listUserCorrections(db, userId, query): Promise<CorrectionPage>;
readUserCorrection(db, userId, requestId): Promise<StudentCorrectionDetail | null>;
addUserMessage(db, userId, requestId, body): Promise<CorrectionMessageDto>;
withdrawCorrection(db, userId, requestId): Promise<StudentCorrectionDetail>;
listAdminCorrections(db, query): Promise<AdminCorrectionPage>;
transitionCorrection(db, adminId, requestId, input): Promise<AdminCorrectionDetail>;
mergeDuplicateCorrection(db, adminId, requestId, canonicalRequestId, publicNote): Promise<AdminCorrectionDetail>;
applyCorrectionOverlay(db, adminId, requestId, input): Promise<AppliedOverlayResult>;
```

Every mutation inserts an event in the same transaction. Student-visible transitions insert a notification in that transaction.

- [ ] **Step 5: Run migration/repository tests and commit**

```powershell
npm.cmd test -- src/lib/corrections/repository.test.ts --maxWorkers=1
git add src/db/schema.ts drizzle src/lib/corrections/repository.ts src/lib/corrections/repository.test.ts
git commit -m "feat(corrections): persist reviewed issue workflow"
```

Expected: PASS; audit/event tests prove there is no status-only update.

---

### Task 3: Add owner-scoped student correction and notification APIs

**Files:**
- Create: `src/app/api/corrections/route.ts`
- Create: `src/app/api/corrections/[id]/route.ts`
- Create: `src/app/api/corrections/[id]/messages/route.ts`
- Create: `src/app/api/corrections/correctionRoutes.test.ts`
- Create: `src/app/api/notifications/route.ts`
- Create: `src/lib/corrections/rateLimit.ts`
- Create: `src/lib/corrections/rateLimit.test.ts`

**HTTP contract:**

```text
GET  /api/corrections                         own paginated requests
POST /api/corrections                         submit request
GET  /api/corrections/:id                     own detail or 404
PATCH /api/corrections/:id                    { action: "withdraw" }
POST /api/corrections/:id/messages            add student message
GET  /api/notifications?cursor=<opaque-cursor> own notifications
PATCH /api/notifications                      mark selected/all read
```

- [ ] **Step 1: Write failing auth/privacy/validation route tests**

Test unauthenticated `401`, owner success, other-user `404` (not `403`), validation `400`, rate `429`, successful `201`, invalid transition `409`, and sanitized DTOs. Use async `RouteContext` for `[id]` routes.

- [ ] **Step 2: Implement a bounded rate-limit adapter**

Define a small interface with an in-memory development/test implementation and a database-backed production implementation using recent request counts. Limit report creation and messages separately. Key by authenticated user ID, not IP alone. Return `Retry-After` without revealing other users.

- [ ] **Step 3: Implement owner-scoped routes**

Resolve session before parsing target IDs. Use repository owner predicates on every read/write. Cap page size at 50 and message body at the schema limit. Set `Cache-Control: private, no-store`.

- [ ] **Step 4: Implement notification read state**

PATCH accepts either `{ ids: string[] }` capped at 100 or `{ all: true }`. Update only rows owned by the session user.

- [ ] **Step 5: Run tests, lint, typecheck, and commit**

```powershell
npm.cmd test -- src/lib/corrections/rateLimit.test.ts src/app/api/corrections/correctionRoutes.test.ts --maxWorkers=1
npm.cmd run lint
npx.cmd tsc --noEmit
git add src/app/api/corrections src/app/api/notifications src/lib/corrections/rateLimit.ts src/lib/corrections/rateLimit.test.ts
git commit -m "feat(api): add private correction reporting"
```

Expected: PASS; cross-user probes return 404.

---

### Task 4: Add transition-checked admin review and apply APIs

**Files:**
- Create: `src/app/api/admin/corrections/route.ts`
- Create: `src/app/api/admin/corrections/[id]/transition/route.ts`
- Create: `src/app/api/admin/corrections/[id]/apply/route.ts`
- Create: `src/app/api/admin/corrections/adminCorrectionRoutes.test.ts`
- Modify: `src/lib/adminAuth.ts` only if a typed helper is needed

- [ ] **Step 1: Write failing admin route tests**

Test unauthenticated `401`, authenticated non-admin `403`, admin list/filter/detail, invalid transition `409`, duplicate merge into a canonical open request, self/cycle/cross-target merge rejection, approved-to-apply success, apply-before-approved `409`, invalid overlay field `400`, stale target/release `409`, duplicate apply `409`, and no private note in the student notification.

- [ ] **Step 2: Implement admin list/filter contract**

Support status, issue type, target kind, school/source, age range, unassigned/assigned reviewer, free text, cursor, and limit. Keep search bounded and parameterized. Return counts by status for the inbox tabs.

- [ ] **Step 3: Implement transition route**

Body:

```ts
{
  toStatus: "in_review" | "needs_information" | "approved" | "rejected";
  publicNote?: string;
  privateNote?: string;
  assignToSelf?: boolean;
}
```

Call `requireAdmin`, policy validation, then the transactional repository function. `needs_information` and `rejected` require a public note.

- [ ] **Step 4: Implement apply route**

Accept only the discriminated overlay schemas from Task 1. Re-read the current target from the active release inside the apply transaction and reject stale/missing targets. Application creates the overlay, event, status `applied`, and notification atomically.

- [ ] **Step 5: Implement duplicate merge as an audited action**

Add `/api/admin/corrections/[id]/merge` with `{ canonicalRequestId, publicNote }`. Require matching target kind/key, distinct requests, an open canonical request, and no merge cycle. In one transaction set the duplicate request to `rejected`, set `duplicateOfId`, create a `merged_duplicate` event, and notify its author with a link to their own report timeline; never expose the canonical request owner's identity or messages.

- [ ] **Step 6: Run tests and commit**

```powershell
npm.cmd test -- src/app/api/admin/corrections/adminCorrectionRoutes.test.ts src/lib/corrections/repository.test.ts --maxWorkers=1
git add src/app/api/admin/corrections src/lib/adminAuth.ts
git commit -m "feat(admin): review and apply corrections"
```

Expected: PASS; there is no client-controlled direct overlay insert route.

---

### Task 5: Compose active overlays into catalog and degree evidence safely

**Files:**
- Create: `src/lib/corrections/overlays.ts`
- Create: `src/lib/corrections/overlays.test.ts`
- Modify: `src/lib/catalog/searchRepository.ts`
- Modify: `src/lib/catalog/searchRepository.test.ts`
- Modify: `src/lib/catalogRepository.ts`
- Modify: `src/lib/bulletin/syncAll.ts`

**Composition contract:**

```ts
export interface OverlayApplication<T> {
  value: T;
  appliedOverlayIds: string[];
  provenance: Array<{
    kind: "bulletin" | "reviewed-overlay";
    referenceId: string;
    appliedAt?: string;
  }>;
}

export function applyCourseOverlays(
  record: CatalogCourseRecord,
  overlays: CatalogOverlay[],
): OverlayApplication<CatalogCourseRecord>;
```

- [ ] **Step 1: Write failing pure overlay tests**

Test each allowlisted course field, requirement mapping add/remove, creation of a reviewed cross-school minor/program record, rejection when that record lacks executable requirements/source URLs/eligible roles, raw-source value preservation, deterministic overlay order, invalid/stale path rejection, superseded overlay exclusion, provenance accumulation, and no mutation of input records.

- [ ] **Step 2: Implement typed overlay application**

Use discriminated switches, not generic object path assignment. For credit changes validate `min <= max`; for fulfillment mappings require an existing NYUSH program/requirement target; for explanatory notes retain both Bulletin and reviewed text/provenance. A reviewed program record receives `auditAuthority: "reviewed-nyush-overlay"`, explicit eligible roles, complete requirement nodes/source references, and never copies or activates a New York Bulletin degree program automatically.

- [ ] **Step 3: Apply overlays in active-release readers**

Search/detail/batch/bootstrap readers query active overlays for returned target keys and compose them server-side before response validation. Add `reviewedOverlayIds`/provenance to DTOs so UI can explain the source.

- [ ] **Step 4: Reconcile overlays when composing a new release**

After a new source snapshot passes validation but before release activation, check every active overlay targeting that source. If the target still exists and the patch remains valid, carry it forward. If source truth now matches the overlay, mark it superseded as resolved. If the target/field conflicts, keep the previous active release and emit a diagnostic requiring maintainer review rather than silently dropping the correction.

- [ ] **Step 5: Run catalog/overlay tests and commit**

```powershell
npm.cmd test -- src/lib/corrections/overlays.test.ts src/lib/catalog/searchRepository.test.ts src/lib/bulletin/syncAll.test.ts --maxWorkers=1
git add src/lib/corrections/overlays.ts src/lib/corrections/overlays.test.ts src/lib/catalog/searchRepository.ts src/lib/catalog/searchRepository.test.ts src/lib/catalogRepository.ts src/lib/bulletin/syncAll.ts
git commit -m "feat(catalog): compose reviewed correction overlays"
```

Expected: PASS; archived source rows are byte-equivalent before and after application.

---

### Task 6: Add contextual student reporting and report history

**Files:**
- Create: `src/components/corrections/ReportIssueDialog.tsx`
- Create: `src/components/corrections/ReportIssueDialog.test.tsx`
- Create: `src/components/corrections/MyReportsSheet.tsx`
- Create: `src/components/corrections/MyReportsSheet.test.tsx`
- Create: `src/components/corrections/CorrectionStatusTimeline.tsx`
- Modify: `src/components/dialogs/CourseDetailDialog.tsx`
- Modify: `src/components/dialogs/CourseDetailDialog.test.tsx`
- Modify: `src/components/progress/RequirementChecklist.tsx`
- Modify: `src/components/progress/RequirementChecklist.test.tsx`
- Modify: `src/components/layout/PlannerHeader.tsx`

- [ ] **Step 1: Write failing Report Issue dialog tests**

Cover prefilled course/program/requirement context, immutable source reference preview, title/description validation, optional suggestion/HTTPS evidence, submit/loading/success/error/rate-limit states, non-official copy, focus restoration, and no attachment control.

- [ ] **Step 2: Implement contextual entry points**

Add `Report an issue` to course details and requirement evidence rows. Rename any existing personal edit action to `Customize for my plan` so reporting source data and editing a personal copy are distinct. Header Help includes `Report another issue` and `My reports`.

- [ ] **Step 3: Write failing My Reports tests**

Test owner list, status filters, load more, detail timeline, student/public messages, needs-information reply, withdrawal where allowed, empty/error states, and other-user data absence.

- [ ] **Step 4: Implement history and timeline**

Use public events/messages only. Present statuses in plain English and show dates, source context, and the notice: `Reviewed by the NYUSH Degree Planner maintainers; this is not an official NYU decision.`

- [ ] **Step 5: Run component tests and commit**

```powershell
npm.cmd test -- src/components/corrections src/components/dialogs/CourseDetailDialog.test.tsx src/components/progress/RequirementChecklist.test.tsx --maxWorkers=1
git add src/components/corrections src/components/dialogs/CourseDetailDialog.tsx src/components/dialogs/CourseDetailDialog.test.tsx src/components/progress/RequirementChecklist.tsx src/components/progress/RequirementChecklist.test.tsx src/components/layout/PlannerHeader.tsx
git commit -m "feat(corrections): add contextual student reports"
```

Expected: PASS.

---

### Task 7: Add the maintainer inbox and in-app notification menu

**Files:**
- Create: `src/components/admin/AdminCorrections.tsx`
- Create: `src/components/admin/AdminCorrections.test.tsx`
- Create: `src/components/corrections/NotificationMenu.tsx`
- Create: `src/components/corrections/NotificationMenu.test.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/components/layout/PlannerHeader.tsx`
- Modify: `src/components/layout/PlannerHeader.test.tsx`

- [ ] **Step 1: Write failing maintainer-inbox tests**

Cover status tabs/counts, source/target/search filters, assignment, detail evidence, public/private note separation, transition buttons by current status, duplicate-target search and merge confirmation, typed overlay editor, approval without apply, apply confirmation, stale target conflict, audit timeline, and keyboard navigation.

- [ ] **Step 2: Implement `AdminCorrections`**

Use the query APIs from this plan and Plan 2. Keep source truth and proposed overlay side by side. A merge flow searches compatible open reports, requires a public reason, and explains that the duplicate author cannot see the other student's report. Require a final confirmation showing exact changed fields before Apply. Display reviewer-only notes with a clear private label.

- [ ] **Step 3: Write failing notification-menu tests**

Test unread count, owner items only, mark one/all read, link to report detail, loading/error/empty states, and no polling while the document is hidden.

- [ ] **Step 4: Implement bounded notification refresh**

Load on menu open and window focus; optional polling may run only while authenticated and visible at a conservative interval. Do not add push/email infrastructure.

- [ ] **Step 5: Run admin/header tests and commit**

```powershell
npm.cmd test -- src/components/admin/AdminCorrections.test.tsx src/components/corrections/NotificationMenu.test.tsx src/components/layout/PlannerHeader.test.tsx --maxWorkers=1
git add src/components/admin/AdminCorrections.tsx src/components/admin/AdminCorrections.test.tsx src/components/corrections/NotificationMenu.tsx src/components/corrections/NotificationMenu.test.tsx src/app/admin/page.tsx src/components/layout/PlannerHeader.tsx src/components/layout/PlannerHeader.test.tsx
git commit -m "feat(admin): add correction inbox and notifications"
```

Expected: PASS.

---

### Task 8: Verify privacy, auditability, overlay safety, and workflow clarity

**Files:**
- Modify only if verification finds a defect: files owned by Tasks 1-7.

- [ ] **Step 1: Run focused correction suites**

```powershell
npm.cmd test -- src/lib/corrections src/app/api/corrections src/app/api/admin/corrections src/components/corrections src/components/admin/AdminCorrections.test.tsx --maxWorkers=1
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

- [ ] **Step 3: Run the end-to-end review rehearsal manually**

As a student: report a New York course description issue, view it in My Reports, receive needs-information, reply, and later see applied. As an admin: take ownership, request information, approve, inspect exact patch, apply, and view the audit trail. Confirm the course detail shows reviewed provenance after application.

- [ ] **Step 4: Probe privacy and authorization**

With two test users and one admin, attempt direct IDs across every student route, message route, notification patch, and admin route. Expected: other-user student resources are `404`; non-admin admin calls are `403`; no private note appears in student payloads or browser markup.

- [ ] **Step 5: Verify source immutability and release carry-forward**

Hash archived source-document and normalized source rows before/after overlay application; hashes must match. Compose a fixture release where source truth resolves one overlay and conflicts with another; resolved becomes superseded, conflict blocks activation with diagnostics, and the previous release remains active.

- [ ] **Step 6: Accessibility/content review**

Use keyboard and screen reader semantics for dialog, sheets, tabs, timeline, messages, inbox, and apply confirmation. Confirm statuses are not color-only, errors focus the relevant field, and every student-facing surface repeats the non-official boundary without legalistic clutter.

---

## Completion Criteria

- Students can submit contextual course/requirement/program/general reports and track only their own requests.
- Maintainers can review through an enforced status graph with public/private notes and immutable events.
- Approval and application are separate; only typed allowlisted overlays affect product data.
- Active readers compose overlays, including explicitly reviewed cross-school program/minor records, without mutating archived Bulletin documents or source snapshots.
- New releases carry, resolve, or explicitly conflict overlays; they never silently drop them.
- In-app notifications cover status changes and information requests; no email or attachment infrastructure exists.
- Authorization, privacy, rate, validation, audit, component, lint, typecheck, build, and accessibility checks pass.

## Handoff to the Next Plan

After this plan is complete, execute `2026-07-17-v0-2-nyu-academic-glass.md`. The visual plan should style these completed workflows without changing their policy or state semantics.
