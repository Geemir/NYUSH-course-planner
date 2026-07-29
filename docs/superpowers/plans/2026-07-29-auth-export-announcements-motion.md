# Authentication, Export, Announcements, and Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in single-agent inline mode. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Google-only authentication, local JSON/XLSX/PDF plan exports, dismissible database-backed Admin announcements, and accessible Anime.js motion across desktop and mobile.

**Architecture:** Authentication is narrowed at the Auth.js provider boundary and reflected in a responsive sign-in surface. A single serializable export model feeds three browser-local renderers, while a dedicated announcement domain owns its schema, repository, public/admin Route Handlers, Admin editor, and browser-local dismissal. Anime.js's WAAPI build is isolated behind ref-based motion helpers and a reactive reduced-motion hook.

**Tech Stack:** Next.js 16.2.9, React 19.2.4, TypeScript 5, Auth.js beta 31, Drizzle ORM 0.45/PostgreSQL/Neon, Tailwind CSS 4, Base UI, Vitest 4, Playwright 1.61, Anime.js 4.5.0, ExcelJS 4.4.0, jsPDF 4.2.1, jsPDF-AutoTable 5.0.8.

## Global Constraints

- Keep all product copy in English and preserve NYU violet as the primary accent.
- Google is the only callable sign-in provider; retain the existing `@nyu.edu` identity gate.
- Email is non-interactive and labeled exactly `Email sign-in - In development`.
- JSON remains the only importable/lossless format; Excel and PDF are share/read formats.
- XLSX/PDF generation stays in the browser and must not send plan content to a server.
- Dynamically import ExcelJS, jsPDF, and jsPDF-AutoTable only after the user selects that format.
- Announcements are plain text, globally visible, and at most one row may be published.
- Dismissal is local to the browser and keyed by announcement ID.
- Use Anime.js WAAPI motion only for inspiration and announcement state; preserve readable default content.
- `prefers-reduced-motion: reduce` disables looping and directional movement.
- Desktop and 390 x 844 mobile browser QA are required; no horizontal overflow at 320 px.
- Work inline without subagents after approval and do not introduce additional confirmation checkpoints.
- Do not apply the migration to production Neon, push Git commits, or deploy Vercel.
- Read the installed Next.js 16 guide relevant to each changed boundary before editing it.
- Execute in an isolated `.worktrees/auth-export-announcements-motion` worktree, then fast-forward verified commits into local `main` without pushing.

---

### Task 1: Google-only authentication and responsive sign-in

**Files:**
- Modify: `src/auth.ts`
- Modify: `src/auth.providers.test.ts`
- Modify: `src/app/signin/page.tsx`
- Create: `src/app/signin/page.test.tsx`

**Interfaces:**
- Produces: `AuthProviderEnv = { AUTH_GOOGLE_ID?: string }`.
- Produces: `buildProviders(env: AuthProviderEnv): Provider[]`, returning either `[Google]` or `[]`.
- Preserves: `isNyuEmail()` and the existing session/admin-role callbacks.

- [ ] **Step 1: Create the isolated worktree and prove the baseline**

Run from the main checkout:

```powershell
git worktree add .worktrees/auth-export-announcements-motion -b codex/auth-export-announcements-motion main
cd .worktrees/auth-export-announcements-motion
npm.cmd install
npm.cmd test -- --run --maxWorkers=2
```

Expected: the branch is based on the approved planning commit and all baseline tests pass.

- [ ] **Step 2: Write failing provider tests**

Replace the provider expectations with:

```ts
it("registers Google only when configured", async () => {
  const { buildProviders } = await loadAuthModule();
  expect(buildProviders({ AUTH_GOOGLE_ID: "google-client" })).toEqual([Google]);
});

it("registers no fallback providers", async () => {
  const { buildProviders } = await loadAuthModule();
  expect(buildProviders({})).toEqual([]);
  expect(buildProviders({
    AUTH_MICROSOFT_ENTRA_ID_ID: "entra-client",
    NODE_ENV: "development",
  } as Parameters<typeof buildProviders>[0])).toEqual([]);
});
```

Keep the existing `@nyu.edu` and role tests.

- [ ] **Step 3: Write failing sign-in component tests**

Mock `getProviders()` and `signIn()` and assert:

```ts
expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDefined();
expect(screen.getByText("Email sign-in - In development")).toBeDefined();
expect(screen.queryByRole("textbox", { name: /email/i })).toBeNull();
```

Add cases for Google loading, missing provider configuration, click dispatch to `signIn("google", { callbackUrl: "/" })`, and a 390 px semantic layout without duplicate actions.

- [ ] **Step 4: Run the authentication tests and verify RED**

Run:

```powershell
npm.cmd test -- src/auth.providers.test.ts src/app/signin/page.test.tsx --run
```

Expected: failures show Microsoft/dev Email providers and the existing Email form.

- [ ] **Step 5: Narrow Auth.js providers**

Remove the Microsoft provider import, `devMagicLink`, and related environment fields. Implement:

```ts
export interface AuthProviderEnv {
  AUTH_GOOGLE_ID?: string;
}

export function buildProviders(env: AuthProviderEnv): Provider[] {
  return env.AUTH_GOOGLE_ID ? [Google] : [];
}
```

Do not remove `verificationTokensTable` from the adapter or database schema.

- [ ] **Step 6: Rebuild the sign-in page**

Use one full-width Google button, a disabled secondary Email row, and bounded unavailable/error copy. Keep the card at `max-w-sm`, use `min-h-11` controls, wrap copy, and avoid fixed widths inside the card. `getProviders()` must be cancellable with an `active` flag so an unmounted page is not updated.

- [ ] **Step 7: Verify and commit authentication**

Run:

```powershell
npm.cmd test -- src/auth.providers.test.ts src/app/signin/page.test.tsx --run
npx.cmd tsc --noEmit
npm.cmd run lint
git diff --check
git add -- src/auth.ts src/auth.providers.test.ts src/app/signin/page.tsx src/app/signin/page.test.tsx
git commit -m "feat(auth): use Google-only sign in"
```

Expected: tests, typecheck, lint, and whitespace checks pass.

### Task 2: Shared plan-export view model

**Files:**
- Create: `src/lib/planExport/model.ts`
- Create: `src/lib/planExport/model.test.ts`
- Modify: `src/lib/planIO.ts`
- Modify: `src/lib/planIO.test.ts`

**Interfaces:**
- Produces: `PlanExportModel`, `ExportSemester`, `ExportCourse`, `ExportRequirement`, and `ExportWarning` serializable types.
- Produces: `buildPlanExportModel(snapshot: PlanSnapshotV2, derived: PlanDerivedValue): PlanExportModel`.
- Resolves study-away IDs to stable display labels from `src/lib/clientReferenceData.ts`; unknown IDs fall back to the stored ID instead of dropping data.
- Produces: `planExportFilename(model, extension): string`.
- Preserves: strict JSON parsing and v1 import compatibility.

- [ ] **Step 1: Define the failing model fixtures and assertions**

Build a v2 fixture containing a variable-credit placement, expected grade, New York study-away site, unresolved course, second major, minor, requirement progress, and warning. Assert exact semester order and representative output:

```ts
expect(model.semesters.map(({ id }) => id)).toEqual(SEMESTER_IDS);
expect(model.semesters[0].courses[0]).toMatchObject({
  code: "CSCI-SHU 101",
  title: "Introduction to Computer Science",
  credits: 3,
  expectedGrade: "A-",
});
expect(model.profile.map(({ role }) => role)).toEqual([
  "core", "primary-major", "second-major", "minor",
]);
expect(model.requirements[0]).toMatchObject({ unitKind: "courses" });
expect(model.disclaimer).toMatch(/planning guidance/i);
```

Also assert unresolved detail falls back to `titleSnapshot`, then course code.

- [ ] **Step 2: Run the model tests and verify RED**

Run:

```powershell
npm.cmd test -- src/lib/planExport/model.test.ts --run
```

Expected: the export-model module does not exist.

- [ ] **Step 3: Implement the serializable export types**

Use these stable shapes:

```ts
export interface PlanExportModel {
  generatedAt: string;
  catalogReleaseId: string | null;
  startYear: number;
  classYear: number;
  profile: Array<{ role: "core" | "primary-major" | "second-major" | "minor"; id: string; name: string }>;
  credits: { required: number; planned: number; completed: number };
  semesters: ExportSemester[];
  requirements: ExportRequirement[];
  warnings: ExportWarning[];
  disclaimer: string;
}
```

`ExportSemester` must contain `id`, `academicYear`, `term`, `site`, `completed`, `credits`, and `courses`. Requirements must carry program role/name, category, unit type, required/planned/completed values, status, and a flattened gap summary.

- [ ] **Step 4: Build the model only from authoritative existing state**

Use `SEMESTER_IDS`, `derived.placementsBySemester`, `derived.creditsBySemester`, `derived.coursesById`, `derived.progress`, `derived.activeProgramObjs`, `derived.allocation.effective`, and `derived.warnings`. Do not call requirement engines again. Accept an optional `now = new Date()` test seam to make `generatedAt` deterministic.

- [ ] **Step 5: Rename the JSON download boundary without changing its schema**

Expose:

```ts
export function downloadPlanJson(snapshot: PersistedPlanSnapshot, startYear: number): void;
```

The filename is `nyush-degree-plan-<startYear>.json`. Keep `downloadPlan` as a deprecated internal alias only if an existing test/import still requires it during migration; remove the alias before Task 8 if unused.

- [ ] **Step 6: Verify and commit the model**

Run:

```powershell
npm.cmd test -- src/lib/planExport/model.test.ts src/lib/planIO.test.ts --run
npx.cmd tsc --noEmit
git diff --check
git add -- src/lib/planExport/model.ts src/lib/planExport/model.test.ts src/lib/planIO.ts src/lib/planIO.test.ts
git commit -m "feat(export): model readable plan exports"
```

### Task 3: Excel/PDF renderers and export menu

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/planExport/download.ts`
- Create: `src/lib/planExport/excel.ts`
- Create: `src/lib/planExport/excel.test.ts`
- Create: `src/lib/planExport/pdf.ts`
- Create: `src/lib/planExport/pdf.test.ts`
- Modify: `src/components/layout/PlannerHeader.tsx`
- Modify: `src/components/layout/PlannerHeader.test.tsx`
- Modify: `tests/e2e/plan-safety.spec.ts`

**Interfaces:**
- Produces: `renderPlanExcel(model: PlanExportModel): Promise<Uint8Array>`.
- Produces: `renderPlanPdf(model: PlanExportModel): Promise<Uint8Array>`.
- Produces: `downloadBytes(bytes, mimeType, filename): void`.
- Consumes: `buildPlanExportModel()` and the current `PlanDerivedValue`.

- [ ] **Step 1: Install exact export dependencies**

Run:

```powershell
npm.cmd install exceljs@4.4.0 jspdf@4.2.1 jspdf-autotable@5.0.8
```

Expected: only `package.json` and `package-lock.json` dependency metadata change.

- [ ] **Step 2: Write failing Excel tests**

Assert `renderPlanExcel()` returns non-empty bytes. Reopen with `ExcelJS.Workbook().xlsx.load()` and verify exact sheet names, frozen header/filter presence, numeric credits, representative course/program rows, and no formula cells beginning with user-provided `=`, `+`, `-`, or `@` text.

- [ ] **Step 3: Write failing PDF tests**

Assert `renderPlanPdf()` returns bytes beginning `%PDF-`, exceeds a bounded minimum size, and calls AutoTable with schedule and requirement table headers. Inject or mock the table adapter for structural assertions rather than parsing text from compressed PDF bytes.

- [ ] **Step 4: Run renderer tests and verify RED**

Run:

```powershell
npm.cmd test -- src/lib/planExport/excel.test.ts src/lib/planExport/pdf.test.ts --run
```

Expected: renderer modules are missing.

- [ ] **Step 5: Implement the Excel workbook**

Use `Workbook`, three exact sheet names, NYU violet `FF57068C`, white heading text, frozen panes, table filters, alternating neutral fills, typed numeric credit cells, wrapped warnings/gaps, and bounded widths. Prefix dangerous spreadsheet-leading text with an apostrophe before writing it as a cell value.

Return `new Uint8Array(await workbook.xlsx.writeBuffer())`; do not download inside the renderer.

- [ ] **Step 6: Implement the PDF document**

Create A4 landscape pages in points. Use `autoTable(doc, options)` with repeated headers and `didDrawPage` to add `NYUSH Degree Plan`, export date, and `Page N`. Use violet headings, dark body text, neutral row striping, and explicit page breaks between overview/schedule/progress when required. Return `new Uint8Array(doc.output("arraybuffer"))`.

- [ ] **Step 7: Add the browser download helper**

`downloadBytes()` must create one Blob URL, click a temporary anchor, remove it, and revoke the URL in `queueMicrotask()` so Safari receives the click before cleanup.

- [ ] **Step 8: Replace the single export menu item with three flat actions**

`PlannerHeader` already has `PlanDerivedProvider` context available. Read `usePlanDerived()`, build the v2 snapshot/model at click time, and implement an `exporting: "json" | "xlsx" | "pdf" | null` guard. JSON stays synchronous. XLSX and PDF handlers use dynamic imports:

```ts
const [{ renderPlanExcel }, { downloadBytes }] = await Promise.all([
  import("@/lib/planExport/excel"),
  import("@/lib/planExport/download"),
]);
```

Show `Preparing Excel export...`/`Preparing PDF export...`, success, and error through Sonner. Do not statically import renderer modules into `PlannerHeader`.

- [ ] **Step 9: Update component and E2E assertions**

The Plan actions menu must expose:

```text
Export JSON backup
Export Excel workbook
Export PDF report
```

Mock the dynamic renderer modules in component tests, assert duplicate clicks are ignored, and keep import/reset behavior unchanged. Update Playwright to assert all three menu items at desktop and mobile viewports.

- [ ] **Step 10: Verify and commit export delivery**

Run:

```powershell
npm.cmd test -- src/lib/planExport src/components/layout/PlannerHeader.test.tsx --run
npx.cmd tsc --noEmit
npm.cmd run lint
git diff --check
git add -- package.json package-lock.json src/lib/planExport src/components/layout/PlannerHeader.tsx src/components/layout/PlannerHeader.test.tsx tests/e2e/plan-safety.spec.ts
git commit -m "feat(export): add Excel and PDF downloads"
```

### Task 4: Announcement contracts, persistence, and migration

**Files:**
- Create: `src/lib/announcements/types.ts`
- Create: `src/lib/announcements/types.test.ts`
- Create: `src/lib/announcements/repository.ts`
- Create: `src/lib/announcements/repository.test.ts`
- Modify: `src/db/schema.ts`
- Create: generated `drizzle/0007_*.sql`
- Modify: generated `drizzle/meta/_journal.json`
- Create: generated `drizzle/meta/0007_snapshot.json`

**Interfaces:**
- Produces: `AnnouncementInputSchema`, `AnnouncementActionSchema`, `AnnouncementSchema`, and `PublicAnnouncementSchema`.
- Produces repository methods `createDraft`, `updateDraft`, `publishAnnouncement`, `archiveAnnouncement`, `listAnnouncements`, and `getCurrentAnnouncement`.

- [ ] **Step 1: Write failing contract tests**

Cover title 1-120 chars, body 1-1000 chars, tone enum, optional HTTPS-only link, link label 1-60 chars, optional future ISO expiry, strict unknown-field rejection, and public DTO omission of `createdBy`/timestamps unrelated to display.

- [ ] **Step 2: Write failing repository workflow tests**

Using the disposable PGlite database, assert:

1. draft is not publicly visible;
2. publishing makes it current;
3. publishing a second draft archives the first in one transaction;
4. expired publication returns `null` publicly;
5. withdrawing archives it;
6. non-draft content cannot be edited;
7. list order is newest first;
8. public DTO contains no actor ID.

- [ ] **Step 3: Run contracts/repository tests and verify RED**

Run:

```powershell
npm.cmd test -- src/lib/announcements/types.test.ts src/lib/announcements/repository.test.ts --run
```

Expected: announcement modules/table do not exist.

- [ ] **Step 4: Implement strict domain contracts**

Use discriminated admin actions:

```ts
export const AnnouncementActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), announcement: AnnouncementInputSchema }).strict(),
  z.object({ action: z.literal("publish") }).strict(),
  z.object({ action: z.literal("archive") }).strict(),
]);
```

Normalize blank optional link fields to `null` before persistence.

- [ ] **Step 5: Add the Drizzle schema and generate the migration**

Define `announcement` exactly as the approved spec, including a partial unique index on `status = 'published'`. Run:

```powershell
npm.cmd run db:generate
```

Inspect the generated SQL and metadata. It must only create the announcement table, indexes, and user foreign key; do not edit generated files manually.

- [ ] **Step 6: Implement transactional repository behavior**

Publishing must run inside `db.transaction()`: lock/select the target draft, archive any published row, update the target with `publishedAt = now`, and return the parsed result. `getCurrentAnnouncement()` filters `status = published` and `(expiresAt IS NULL OR expiresAt > now)`.

- [ ] **Step 7: Verify migration/repository and commit**

Run:

```powershell
npm.cmd test -- src/lib/announcements/types.test.ts src/lib/announcements/repository.test.ts --run
npx.cmd tsc --noEmit
git diff --check
git add -- src/lib/announcements src/db/schema.ts drizzle
git commit -m "feat(announcements): persist global notices"
```

### Task 5: Public and Admin announcement APIs

**Files:**
- Create: `src/app/api/announcements/current/route.ts`
- Create: `src/app/api/announcements/current/route.test.ts`
- Create: `src/app/api/admin/announcements/route.ts`
- Create: `src/app/api/admin/announcements/[id]/route.ts`
- Create: `src/app/api/admin/announcements/adminAnnouncementRoutes.test.ts`

**Interfaces:**
- Public GET returns `{ announcement: PublicAnnouncement | null }` with private/no-store headers.
- Admin GET returns `{ items: Announcement[] }`.
- Admin POST accepts `AnnouncementInput` and creates a draft.
- Admin PATCH accepts `AnnouncementAction` and returns the updated announcement.

- [ ] **Step 1: Write failing route-contract tests**

Mock repository and `requireAdminUser()`. Assert public access without auth, `Cache-Control: private, no-store`, 401/403 admin gates before body parsing, 400 malformed JSON, 422 schema validation, 404 missing ID, 409 stale lifecycle transition, and safe 500 serialization.

- [ ] **Step 2: Run route tests and verify RED**

Run:

```powershell
npm.cmd test -- src/app/api/announcements src/app/api/admin/announcements --run
```

Expected: route modules are missing.

- [ ] **Step 3: Implement the public route**

Call `getCurrentAnnouncement(db, new Date())`, map through `PublicAnnouncementSchema`, and return a bounded response. Do not export creator/internal timestamps.

- [ ] **Step 4: Implement protected Admin routes**

Use `requireAdminUser()` from `src/lib/adminAuth.ts`. Parse dynamic IDs with Next.js 16's async `RouteContext<"/api/admin/announcements/[id]">`. Map domain errors to 404/409 without exposing SQL messages.

- [ ] **Step 5: Verify and commit routes**

Run:

```powershell
npm.cmd test -- src/app/api/announcements src/app/api/admin/announcements --run
npx.cmd next typegen
npx.cmd tsc --noEmit
npm.cmd run lint
git diff --check
git add -- src/app/api/announcements src/app/api/admin/announcements
git commit -m "feat(announcements): expose public and admin APIs"
```

### Task 6: Mobile-ready Admin announcement publishing

**Files:**
- Create: `src/components/admin/AdminAnnouncements.tsx`
- Create: `src/components/admin/AdminAnnouncements.test.tsx`
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes the Admin routes from Task 5.
- Produces one responsive draft editor and lifecycle history panel.

- [ ] **Step 1: Write failing Admin UI tests**

Cover initial history load, validation, Save draft, edit draft, Publish confirmation, Withdraw confirmation, server error, expired/status labels, and empty state. Assert form controls by accessible names and ensure action buttons remain discoverable without hover.

- [ ] **Step 2: Run Admin UI tests and verify RED**

Run:

```powershell
npm.cmd test -- src/components/admin/AdminAnnouncements.test.tsx --run
```

Expected: component is missing.

- [ ] **Step 3: Implement the responsive editor**

Use controlled fields for title/body/tone/link label/link URL/expiry. Desktop may use two columns for compact metadata; below `sm`, use one column. Keep title/body full width, body at least four rows, labels visible, and controls `min-h-11`. Disable mutation buttons while a request is active and use Sonner for result feedback.

- [ ] **Step 4: Implement lifecycle history**

Render status, tone, title, publication/expiry, and actions as a vertical list rather than a wide table. At mobile width, action buttons wrap below content. Never use destructive delete; archived history remains visible.

- [ ] **Step 5: Add the panel near the top of Admin**

Render `<AdminAnnouncements />` immediately after the Admin page header and before correction/catalog tools. Update the page description to mention announcements without changing its auth gate.

- [ ] **Step 6: Verify and commit Admin publishing**

Run:

```powershell
npm.cmd test -- src/components/admin/AdminAnnouncements.test.tsx --run
npx.cmd tsc --noEmit
npm.cmd run lint
git diff --check
git add -- src/components/admin/AdminAnnouncements.tsx src/components/admin/AdminAnnouncements.test.tsx src/app/admin/page.tsx
git commit -m "feat(admin): publish planner announcements"
```

### Task 7: Dismissible banner and Anime.js motion system

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/hooks/useReducedMotion.ts`
- Create: `src/hooks/useReducedMotion.test.tsx`
- Create: `src/lib/motion/productMotion.ts`
- Create: `src/lib/motion/productMotion.test.ts`
- Create: `src/components/announcements/AnnouncementBanner.tsx`
- Create: `src/components/announcements/AnnouncementBanner.test.tsx`
- Modify: `src/components/inspiration/InspirationStrip.tsx`
- Modify: `src/components/inspiration/InspirationStrip.test.tsx`
- Modify: `src/components/onboarding/OnboardingDialog.tsx`
- Modify: `src/components/onboarding/OnboardingDialog.test.tsx`
- Modify: `src/components/PlannerApp.tsx`
- Modify: `src/components/PlannerApp.test.tsx`

**Interfaces:**
- Produces: `useReducedMotion(): boolean` with live media-query updates.
- Produces cancellable `startQuoteAmbient`, `animateQuoteExit`, `animateQuoteEnter`, `animateRefreshIcon`, `animateAnnouncementEnter`, and `animateAnnouncementExit` helpers.
- Produces: `AnnouncementBanner` public-client component.

- [ ] **Step 1: Install Anime.js**

Run:

```powershell
npm.cmd install animejs@4.5.0
```

- [ ] **Step 2: Write failing reduced-motion and motion-helper tests**

Stub `matchMedia` change listeners and verify the hook reacts after mount. Mock `waapi.animate` and assert exact motion contracts:

```ts
expect(startQuoteAmbient(element, false)).toUse({
  y: [0, -2, 0], opacity: [1, 0.96, 1], duration: 7500, loop: true,
});
expect(startQuoteAmbient(element, true)).toBeNull();
```

Exit must be 140 ms, enter 260 ms with `outQuint`, refresh feedback 220 ms, announcement enter 220 ms, and announcement exit 160 ms. Reduced motion returns an already-complete/no-op result.

- [ ] **Step 3: Write failing InspirationStrip behavior tests**

Assert ambient animation begins after mount, clicking calls exit before quote state changes, entrance follows the replacement, the icon receives one feedback animation, the button is briefly disabled, session storage receives only the final quote ID, rapid duplicate click is ignored, cleanup cancels active instances, and reduced motion changes immediately without Anime.js calls.

- [ ] **Step 4: Write failing announcement banner tests**

Mock fetch and cover public DTO display, safe external link, dismiss-after-exit ordering, localStorage key, same-ID suppression after rerender, new-ID reappearance, storage failure, fetch failure, tone text/icon, and reduced motion.

- [ ] **Step 5: Run the motion/banner tests and verify RED**

Run:

```powershell
npm.cmd test -- src/hooks/useReducedMotion.test.tsx src/lib/motion/productMotion.test.ts src/components/inspiration/InspirationStrip.test.tsx src/components/announcements/AnnouncementBanner.test.tsx --run
```

Expected: new modules/animations are missing.

- [ ] **Step 6: Implement the reactive preference and Anime.js boundary**

Import only `waapi` from `animejs`. Accept actual `HTMLElement` targets, return a small common `{ cancel(): void; finished: Promise<unknown> } | null` surface, and never select global CSS targets. Start from visible DOM styles, use transforms/opacity/bounded blur, and call `cancel()` on replacement/unmount.

- [ ] **Step 7: Sequence inspiration state safely**

Use quote and icon refs plus an `isTransitioning` guard. Await exit completion, compute/persist/set the next quote, wait one animation frame for committed DOM, then enter and restart ambient motion. In reduced motion, update/persist synchronously. Maintain `aria-live="polite"` around only the quote text.

- [ ] **Step 8: Implement the public announcement banner**

Fetch `/api/announcements/current` with `cache: "no-store"` and an AbortController. Before display, check `nyush-planner:announcement-dismissed:<id>`. Render a semantic status region immediately below the planner header, with safe text, optional link, and `Dismiss announcement` button. On fetch error return `null` without a toast.

- [ ] **Step 9: Integrate banner and shared reduced motion**

Add `<AnnouncementBanner />` after `<PlannerHeader />` and before the inspiration container. Reuse `useReducedMotion()` in `OnboardingDialog` instead of reading `matchMedia()` ad hoc, keeping its existing guide helper and timing unchanged.

- [ ] **Step 10: Verify and commit motion/banner delivery**

Run:

```powershell
npm.cmd test -- src/hooks/useReducedMotion.test.tsx src/lib/motion/productMotion.test.ts src/components/inspiration/InspirationStrip.test.tsx src/components/announcements/AnnouncementBanner.test.tsx src/components/onboarding/OnboardingDialog.test.tsx src/components/PlannerApp.test.tsx --run
npx.cmd tsc --noEmit
npm.cmd run lint
git diff --check
git add -- package.json package-lock.json src/hooks/useReducedMotion.ts src/hooks/useReducedMotion.test.tsx src/lib/motion src/components/inspiration src/components/announcements src/components/onboarding/OnboardingDialog.tsx src/components/onboarding/OnboardingDialog.test.tsx src/components/PlannerApp.tsx src/components/PlannerApp.test.tsx
git commit -m "feat(ui): animate thoughts and announcements"
```

### Task 8: Responsive, artifact, migration, and release verification

**Files:**
- Modify: `tests/e2e/accessibility-responsive.spec.ts`
- Create: `tests/e2e/auth-export-announcements.spec.ts`
- Modify: `tests/e2e/support/database.ts`
- Modify: `README.md`
- Modify: `DEPLOY.md`
- Modify: `.planning/2026-07-29-auth-export-announcements-motion/task_plan.md`
- Modify: `.planning/2026-07-29-auth-export-announcements-motion/findings.md`
- Modify: `.planning/2026-07-29-auth-export-announcements-motion/progress.md`

**Interfaces:**
- Consumes every prior deliverable.
- Produces final local verification evidence and exact production handoff steps without executing them.

- [ ] **Step 1: Seed deterministic E2E announcement data**

Extend the disposable E2E database seeder with one published info announcement and a helper for draft/published transitions. Do not alter production seed/catalog scripts.

- [ ] **Step 2: Add end-to-end product flows**

Cover:

- `/signin` exposes Google only and Email-in-development at desktop/mobile;
- public banner displays, link is reachable, dismisses, remains hidden on reload, and a new ID reappears;
- Admin can save/publish/withdraw in its protected fixture session;
- Plan actions exposes JSON/XLSX/PDF and each download has the correct extension/MIME;
- mobile menus/forms/banner do not overflow and all primary controls are visible;
- reduced-motion emulation removes looping/directional motion while content still changes.

- [ ] **Step 3: Generate representative artifacts locally**

Use the same renderer functions with a fixture model to write temporary QA outputs under `tmp/plan-export-qa/`:

```text
nyush-degree-plan-2025.xlsx
nyush-degree-plan-2025.pdf
```

Temporary outputs remain ignored and are not committed.

- [ ] **Step 4: Verify Excel content and rendering**

Load the bundled workspace dependencies, then read the bundled spreadsheet artifact API quick start and style guidelines completely before using the artifact tooling. Inspect representative values/formulas, scan for formula errors, and render all three sheets. Verify sheet names, typed credits, frozen headers, filters, widths, wrapping, contrast, and no clipped content.

- [ ] **Step 5: Verify PDF structure and visual pages**

Reopen the PDF with `pypdf`, require at least one page and a valid title/footer text extraction, render every page with Poppler, and inspect the PNGs for wrapping, repeated headers, page numbers, grayscale contrast, and clipping.

- [ ] **Step 6: Run focused and complete automated gates**

Run:

```powershell
npm.cmd test -- src/auth.providers.test.ts src/app/signin/page.test.tsx src/lib/planExport src/lib/announcements src/app/api/announcements src/app/api/admin/announcements src/components/admin/AdminAnnouncements.test.tsx src/components/announcements/AnnouncementBanner.test.tsx src/components/inspiration/InspirationStrip.test.tsx src/components/onboarding/OnboardingDialog.test.tsx src/components/layout/PlannerHeader.test.tsx src/components/PlannerApp.test.tsx --run
npm.cmd test -- --run --maxWorkers=2
npm.cmd run lint
npx.cmd next typegen
npx.cmd tsc --noEmit
npm.cmd run build
git diff --check
```

Expected: all commands exit 0. Generated `.next` output remains ignored.

- [ ] **Step 7: Run browser QA**

Run the production build locally and inspect:

- desktop 1440 x 1000;
- mobile 390 x 844;
- narrow 320 x 700 overflow check;
- light/dark themes;
- reduced motion;
- keyboard-only sign-in, announcement dismissal, export menu, and Admin form;
- browser console errors and failed requests.

No content may be hidden before animation completion or left transformed after cancellation.

- [ ] **Step 8: Document operator migration/deployment order**

Add these reviewed, non-executed production steps to `DEPLOY.md`:

```powershell
$env:DATABASE_URL = '<Neon pooled connection string>'
npm.cmd run db:push
npm.cmd run build
```

Document that Neon migration must precede the Vercel deployment, and that the operator must smoke-test Google sign-in, announcement publish/dismiss, Excel/PDF downloads, mobile, and reduced motion. Do not include secrets or execute either production step.

- [ ] **Step 9: Update README and planning evidence**

Document Google-only auth, export formats, announcement lifecycle, required environment variables, local migration, and the no-production-action boundary. Mark planning phases complete and record exact test/artifact/browser results.

- [ ] **Step 10: Commit final verification documentation**

Run:

```powershell
git add -- tests/e2e README.md DEPLOY.md .planning/2026-07-29-auth-export-announcements-motion
git commit -m "docs: verify auth exports announcements and motion"
```

- [ ] **Step 11: Fast-forward verified work into local main**

From the main checkout, protect any new local edits with a reversible stash if necessary, then:

```powershell
git merge --ff-only codex/auth-export-announcements-motion
npm.cmd test -- --run --maxWorkers=2
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
```

After successful merged verification, restore any protected local edits, remove `.worktrees/auth-export-announcements-motion`, prune worktrees, and delete the merged feature branch. Do not push.

## Production authorization gate

This plan ends with a verified local `main`. It does not authorize either command below:

```powershell
$env:DATABASE_URL = '<production Neon pooled connection string>'
npm.cmd run db:push
git push origin main
```

The user/operator owns production migration, GitHub push, and Vercel deployment after reviewing the local result.
