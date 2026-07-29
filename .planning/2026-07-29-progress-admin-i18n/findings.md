# Findings

## Progress

- `RequirementChecklist` already renders course code plus title for matched and missing course IDs, using `coursesById`; titles are truncated visually. We still need fallbacks and coverage verification across every Progress course-list surface.
- The confusing copy is concentrated in `EvidenceRow`: “Confirmation required”, “Recorded as fulfilled”, and “Record confirmation”.
- Fulfillment facts currently support only `waiver`, `exam`, and `manualConfirmation`; there is no category-level planned/completed override.
- Category status is derived solely from earned/planned units. A new explicit override must not silently destroy underlying calculated progress.
- The top warning note is verbose and alarmist. It can become a compact trust/provenance card, with detailed guidance moved to first-visit onboarding.
- Requirement rows already provide a Bulletin link and a prefilled “Report requirement issue” dialog when a source URL exists.
- `WarningCenter` supports dismiss/restore only; warning rows have no issue-report action or source context.
- `PlannerApp` directly renders `FeasibilityDialog` in Progress. Removal can be limited to the product surface unless dependency inspection proves the calculation engine unused everywhere.

## Admin and data model

- Bulletin course/program snapshots are intentionally immutable.
- Active `catalogOverlay` records are composed on reads and reconciled against future releases. This is the correct extension seam for direct maintenance.
- Existing course overlays can edit title, description, credit range, attributes, prerequisite text, and cross-list IDs, but not catalog offering terms or deletion state.
- Existing requirement overlays only add/remove a course fulfillment mapping, exclude a course, or add a note. They cannot replace/edit a requirement node, add/delete categories, or change all/choose/manual-confirmation structure.
- Existing overlay creation is coupled to an approved correction request. Direct admin maintenance needs its own audited creation path or a generalized audit origin.
- `AdminCourses` currently offers reviewed manual record import and read-only Bulletin search. It explicitly does not edit/delete source records.
- `AdminRules` maintains special rules separately and is not a structured degree-requirement editor.

## Localization and brand

- No existing i18n/locale framework was found.
- Primary UI copy is distributed across planner shell, catalog, plan board, Progress, onboarding, dialogs, and account/correction components.
- Existing design tokens already preserve an NYU violet/plum/lavender product palette, Apple-like system typography, touch sizing, and reduced-motion rules.
- The supplied `NYU-Violets-Logo.png` is present at repo root as an untracked 3840×2160 transparent wordmark asset. It should be optimized and moved under `public` during implementation.
- Admin remains English by requirement; official course names/descriptions, verbatim Bulletin text, and thoughts also remain untranslated.

## Next.js 16.2.9 preflight

- The repository uses Next.js `16.2.9`; the required bundled documentation was read before implementation planning.
- A client locale context is valid for the highly interactive planner, but the provider should be placed as deep as practical to avoid pulling server-rendered/admin surfaces into the client bundle.
- Local static logo imports with `next/image` provide intrinsic dimensions and prevent layout shift.
- Route Handler mutations are not cached by default. Every Admin mutation endpoint still needs explicit server-side authentication/authorization; UI role checks are not sufficient.
- Next.js documents locale routing, but route-prefixed localization would cause unnecessary URL and app-tree churn here. The recommended persisted UI locale context remains appropriate for the requested in-place language switch.
- Drizzle migrations are versioned through `drizzle/`; a new schema migration will be generated only if the audited direct-edit model needs additional origin/event columns.

## Risks

- A destructive-looking “delete” must be an overlay tombstone, not deletion of source truth, and must be reversible/audited.
- Requirement node editing needs schema validation and stable category targeting to avoid breaking plan evaluation.
- Manual progress overrides must be visually distinguishable from calculated progress and survive JSON/PDF/Excel export plus persisted plan migration.
- Warning reports need enough structured context to be useful without inventing a Bulletin source when the warning is derived from the student plan.
