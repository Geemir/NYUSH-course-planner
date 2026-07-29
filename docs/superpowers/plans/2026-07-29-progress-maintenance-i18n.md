# Progress, Catalog Maintenance, and Simplified Chinese Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a clearer, manually adjustable Degree Progress experience, reportable warnings, audited direct catalog maintenance, and a bilingual English/Simplified-Chinese planner header and primary UI.

**Architecture:** Plan-level requirement overrides remain separate from Bulletin evidence and are applied during deterministic progress derivation. Catalog edits are immutable-source overlays with append-only audit events. Localization uses a small typed client dictionary because the planner is already a client application and URLs must remain stable.

**Tech Stack:** Next.js 16.2.9 App Router, React 19, TypeScript, Zustand, Zod 4, Drizzle/PostgreSQL/PGlite, Vitest/Testing Library, Playwright, Tailwind CSS 4, Base UI, ExcelJS, jsPDF.

## Global Constraints

- Keep Bulletin source snapshots immutable.
- Direct Admin/Maintainer saves publish immediately and must be reversible and audited.
- Header order: NYU Violets logo, language control, navigation/account controls.
- Do not translate course names/descriptions, Bulletin quotations, thoughts, or Admin UI.
- English remains the default locale.
- Preserve mobile usability, keyboard access, and reduced-motion behavior.
- Follow strict red-green-refactor TDD for every behavior change.

---

### Task 1: Persisted manual requirement status

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/planIO.ts`
- Modify: `src/lib/progress.ts`
- Modify: `src/lib/derivePlan.ts`
- Modify: `src/store/plannerStore.ts`
- Modify: `src/lib/planMigration.ts`
- Test: `src/lib/progress.test.ts`
- Test: `src/lib/planIO.test.ts`
- Test: `src/store/plannerStore.test.ts`

**Interfaces:**
- Produces `RequirementStatusOverride { programId; categoryId; status: "planned" | "completed" }`.
- Produces `setRequirementStatus(programId, categoryId, status | null)`.
- `computeProgress` consumes `requirementStatusOverrides` and exposes calculated/effective units plus `manualStatus` on each category.

- [ ] Write failing tests proving legacy plans default to no overrides, planned/completed overrides change effective progress, clear restores calculated progress, and snapshots round-trip.
- [ ] Run targeted tests and confirm failures are caused by missing override behavior.
- [ ] Add the schema/types, store mutation, migration defaults, and derivation logic.
- [ ] Run targeted tests until green, then run all progress/store/plan I/O tests.

### Task 2: Progress UI and first-visit guide

**Files:**
- Modify: `src/components/PlannerApp.tsx`
- Modify: `src/components/layout/PlannerWorkspace.tsx`
- Modify: `src/components/progress/RequirementChecklist.tsx`
- Create: `src/components/progress/ProgressGuide.tsx`
- Create: `src/hooks/useProgressGuide.ts`
- Remove: `src/components/progress/FeasibilityDialog.tsx` if repository-wide references are UI-only
- Test: `src/components/progress/RequirementChecklist.test.tsx`
- Test: `src/components/layout/PlannerWorkspace.test.tsx`
- Test: `src/components/PlannerApp.test.tsx`

**Interfaces:**
- `PlannerWorkspace` produces `onProgressVisit()` from actual rail visibility or sheet interaction.
- `ProgressGuide` consumes `open`, `onOpenChange`, and localized copy.

- [ ] Write failing tests for no feasibility control, code-plus-title rows, “Mark as fulfilled”, compact source copy, manual category controls, actual Progress visit events, and versioned guide persistence.
- [ ] Confirm each test fails for the absent behavior.
- [ ] Implement the compact checklist, manual status menu, visit callback, and responsive guide.
- [ ] Run the component tests and accessibility assertions until green.

### Task 3: Report every Plan and Progress warning

**Files:**
- Create: `src/lib/corrections/warningContext.ts`
- Modify: `src/components/progress/WarningCenter.tsx`
- Modify: `src/components/planner/CourseChip.tsx`
- Test: `src/lib/corrections/warningContext.test.ts`
- Test: `src/components/progress/WarningCenter.test.tsx`
- Test: `src/components/planner/PlannerBoard.test.tsx`

**Interfaces:**
- Produces `warningReportContext(warning, catalogReleaseId)` returning a `ReportIssueDialog` context with target `{ kind: "other", area: "planner-warning" }` and a complete displayed value.

- [ ] Write failing tests for prefilled course/semester warning reports from both surfaces.
- [ ] Confirm failures show the missing report action/context.
- [ ] Implement a shared context builder and accessible report actions without coupling report to warning dismissal.
- [ ] Run warning and planner component tests until green.

### Task 4: Direct audited catalog overlay model

**Files:**
- Modify: `src/lib/corrections/policy.ts`
- Modify: `src/lib/corrections/overlays.ts`
- Modify: `src/lib/catalog/searchRepository.ts`
- Modify: `src/lib/catalogRepository.ts`
- Modify: `src/db/schema.ts`
- Add: generated `drizzle/0008_*.sql`
- Create: `src/lib/catalogMaintenance/types.ts`
- Create: `src/lib/catalogMaintenance/repository.ts`
- Test: `src/lib/corrections/overlays.test.ts`
- Test: `src/lib/catalogMaintenance/repository.test.ts`
- Test: `src/lib/catalog/searchRepository.test.ts`

**Interfaces:**
- Adds overlay inputs `course-delete`, `requirement-upsert`, and `requirement-delete`.
- Extends course changes with `catalogOfferingTerms`, `catalogOfferingText`, `offered`, `offeringText`, and `offeringKnown`.
- Produces `applyDirectCatalogOverlay`, `setCatalogOverlayActive`, and `listDirectCatalogOverlays`.

- [ ] Write failing schema/composition/repository tests for offering edits, tombstones, category upsert/delete, audit events, revert/restore, and release reconciliation.
- [ ] Confirm failures are behavioral rather than fixture errors.
- [ ] Add the additive database migration, strict mutation schemas, overlay composition, query filtering, and transactional audit repository.
- [ ] Run overlay/catalog/database tests until green.

### Task 5: Admin/Maintainer authorization and maintenance API

**Files:**
- Modify: `src/auth.ts`
- Modify: `src/types/next-auth.d.ts`
- Modify: `src/lib/adminAuth.ts`
- Modify: `src/app/admin/page.tsx`
- Create: `src/app/api/admin/catalog-maintenance/route.ts`
- Create: `src/app/api/admin/catalog-maintenance/[id]/route.ts`
- Test: `src/auth.test.ts`
- Test: `src/lib/adminAuth.test.ts`
- Test: `src/app/api/admin/catalog-maintenance/route.test.ts`

**Interfaces:**
- Adds role `maintainer` and `requireMaintainerUser()` accepting admin or maintainer.
- API GET lists editable active programs/direct overlays; POST validates and publishes a direct overlay; PATCH reverts/restores an overlay.

- [ ] Write failing role and Route Handler authorization/validation tests.
- [ ] Confirm student requests fail and maintainer/admin requests reach the repository.
- [ ] Implement stored/allowlisted maintainer resolution and protected no-store APIs.
- [ ] Run auth and route tests until green.

### Task 6: Visual Course and Requirement maintenance

**Files:**
- Create: `src/components/admin/CatalogMaintenance.tsx`
- Create: `src/components/admin/CourseMaintenanceEditor.tsx`
- Create: `src/components/admin/RequirementMaintenanceEditor.tsx`
- Create: `src/components/admin/RequirementNodeEditor.tsx`
- Modify: `src/app/admin/page.tsx`
- Test: `src/components/admin/CatalogMaintenance.test.tsx`
- Test: `src/components/admin/RequirementNodeEditor.test.tsx`

**Interfaces:**
- Editors emit the strict overlay inputs from Task 4 and always require a non-empty reason.
- Requirement tree controls cover course/all/any/choose/credits/attribute/exclusion/waiver/manualConfirmation.

- [ ] Write failing tests for editing course fields/terms, deleting/restoring a course, adding/deleting categories, all-to-choose conversion, count changes, and manual-confirmation conversion.
- [ ] Confirm failures expose missing UI interactions.
- [ ] Implement responsive English-only editors with source-versus-effective values and human-readable change previews.
- [ ] Run admin component tests until green.

### Task 7: Typed localization and branded header

**Files:**
- Create: `src/lib/i18n/types.ts`
- Create: `src/lib/i18n/dictionaries.ts`
- Create: `src/components/i18n/LocaleProvider.tsx`
- Create: `src/components/i18n/LanguageControl.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/layout/PlannerHeader.tsx`
- Modify primary planner/catalog/plan/progress/onboarding/report components using user-facing UI strings
- Add: `public/nyu-violets-logo.png`
- Test: `src/components/i18n/LocaleProvider.test.tsx`
- Test: `src/components/layout/PlannerHeader.test.tsx`
- Test: `src/lib/i18n/dictionaries.test.ts`

**Interfaces:**
- Produces `useLocale()` with `{ locale, setLocale, t }` and stable key typing.
- `LanguageControl` renders immediately after the logo.

- [ ] Write failing tests for English default, persisted Simplified Chinese, document language, representative primary-surface translations, exclusions, and exact header order.
- [ ] Confirm failures are caused by absent localization/logo behavior.
- [ ] Implement typed dictionaries/provider, optimize and add the supplied logo, and replace primary UI literals while leaving exclusions untouched.
- [ ] Run localization/header/component tests until green.

### Task 8: Export, documentation, and release verification

**Files:**
- Modify: `src/lib/planExport/model.ts`
- Modify: `src/lib/planExport/excel.ts`
- Modify: `src/lib/planExport/pdf.ts`
- Modify: `README.md`
- Modify: `DEPLOY.md`
- Test: `src/lib/planExport/model.test.ts`
- Test: `src/lib/planExport/excel.test.ts`
- Test: `src/lib/planExport/pdf.test.ts`
- Test: `tests/e2e/*.spec.ts`

**Interfaces:**
- Exports include `statusSource: "calculated" | "manual"` and the selected manual status for each requirement.

- [ ] Write failing export tests proving manual states appear in the model, workbook, and PDF.
- [ ] Implement export fields and concise advising labels.
- [ ] Update setup/migration/maintainer documentation and add requirement-level acceptance evidence.
- [ ] Run targeted tests, full unit suite, lint, build, database migration rehearsal, and responsive Playwright checks.
- [ ] Self-review the final diff against every objective item, fix gaps via red-green cycles, and only then integrate safely.

