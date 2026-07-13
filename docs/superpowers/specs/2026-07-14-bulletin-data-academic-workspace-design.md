# NYUSH Bulletin Data and Academic Workspace Design

**Date:** 2026-07-14

**Status:** Approved

**Product language:** English
**Authoritative source:** NYU Shanghai Undergraduate Bulletin

## 1. Summary

The NYUSH Course Planner will replace Albert-centered catalog ingestion with a versioned, deterministic pipeline sourced from the public NYU Shanghai Undergraduate Bulletin. A complete valid Bulletin snapshot will publish automatically and atomically. The product will retain the previous active snapshot whenever a fetch, parse, normalization, or validation step fails.

The planner interface will be redesigned as an Academic Workspace. The course catalog and degree-progress tools remain supporting rails on wide screens, while the eight semesters become a single chronological column of larger planning surfaces. A persistent Guide action, first-visit onboarding, an original academic background asset, and rotating inspirational aphorisms will improve activation and atmosphere without making the product feel like a marketing page.

## 2. Goals

- Cover every degree-bearing NYU Shanghai undergraduate major listed by the Bulletin.
- Ingest complete Shanghai course details, including descriptions, credit ranges, offerings, prerequisites, attributes, grading, repeatability, and equivalencies where present.
- Preserve all official requirements and policy text even when a rule cannot be safely automated.
- Automatically publish only complete, structurally valid snapshots.
- Keep source provenance and historical versions so users and administrators can understand which Bulletin version produced a result.
- Repair the confirmed persistence, authentication, authorization, referential-integrity, performance, and messaging issues.
- Change the semester board from a multi-column year grid to a one-column chronological timeline.
- Make the interface larger, calmer, more legible, and more mature while retaining NYU violet as the product accent.
- Teach first-time users how to choose a program, find courses, build a plan, and interpret progress.

## 3. Non-goals

- Repairing or extending Albert connectivity.
- Consuming Bulletin search endpoints, CourseLeaf administration endpoints, or Class Search APIs disallowed by `robots.txt`.
- Treating the sample plan of study as a degree requirement.
- Guessing ambiguous prerequisite logic or advisor-dependent rules.
- Building the future student correction/addition submission workflow in this release.
- Full localization or a language switcher.
- Proving schedule feasibility with an optimizer; the current feasibility feature remains heuristic guidance.

## 4. Source Boundary and Discovery

The importer uses four public source families:

1. `/undergraduate/shanghai/programs/` enumerates programs and displayed credentials.
2. `/undergraduate/shanghai/courses/` enumerates Shanghai subject pages.
3. `/undergraduate/shanghai/core-curriculum/` defines shared Core requirements, proficiencies, and exam waivers.
4. `/sitemap.xml` supplies URL and `lastmod` cross-checks.

At design time, the program index contains 19 BA/BS majors and 23 minors, and the course index contains 46 Shanghai subject pages. These counts are observations, not hard-coded publication requirements. Each synchronization derives its expected page set from the current authoritative indexes and cross-checks it against the sitemap.

The importer does not follow course links into `/search/`. Course details are resolved by parsing the public subject inventories.

## 5. Ingestion Architecture

### 5.1 Pipeline

```text
discover
  -> fetch
  -> parse lossless source documents
  -> normalize executable records
  -> validate complete candidate
  -> write candidate snapshot
  -> atomically activate candidate
  -> retain previous snapshot
```

Discovery, parsing, normalization, validation, persistence, and publication are separate modules with explicit inputs and outputs. Network access is injected behind a fetch interface so parser and publication tests use local fixtures.

### 5.2 Fetch behavior

- Identify requests with a descriptive user agent.
- Limit concurrency and enforce a delay between requests.
- Apply per-request timeouts and bounded retries for transient failures.
- Record status, final URL, response hash, fetch time, and sitemap `lastmod`.
- Reject non-HTML responses and unexpected redirects outside `bulletins.nyu.edu`.
- Never publish a partial result after a fetch failure.
- Skip normalization/publication when all canonical content hashes match the active snapshot.

### 5.3 Stable CourseLeaf selectors

Subject pages use:

- `.courseblock`
- `.detail-code`
- `.detail-title`
- `.detail-hours_html`
- `.detail-typically_offered`
- `.courseblockextra`
- `.detail-grading`
- `.detail-repeatability`
- `.detail-prerequisites`
- `.detail-attr_display`

Program pages use:

- `#curriculumtextcontainer`
- `.sc_courselist`
- `.sc_plangrid`
- `areaheader`
- `areasubheader`
- `codecol`
- `courselistcomment`
- `hourscol`

Selectors are implementation details protected by structural assertions. A selector miss is a synchronization failure, never an empty successful import.

## 6. Two-layer Data Model

### 6.1 Lossless source layer

The source layer preserves official meaning and provenance before any attempt to make rules executable.

```ts
type BulletinSourceDocument = {
  kind: "program" | "subject" | "core";
  sourceUrl: string;
  catalogYear: string;
  sitemapLastModified?: string;
  fetchedAt: string;
  contentHash: string;
  title: string;
  sections: SourceSection[];
};

type SourceSection = {
  id: string;
  heading: string;
  prose: string[];
  tables: SourceTable[];
  footnotes: SourceFootnote[];
};
```

Source tables retain row order, row role, displayed text, credits text, linked course codes, and footnote references. Sample plans, outcomes, policies, and exclusions remain distinct sections.

### 6.2 Executable requirement layer

```ts
type RequirementNode =
  | { kind: "course"; courseId: string }
  | { kind: "all"; children: RequirementNode[] }
  | { kind: "any"; children: RequirementNode[] }
  | { kind: "choose"; count: number; children: RequirementNode[] }
  | { kind: "credits"; minimum: number; children: RequirementNode[] }
  | { kind: "attribute"; attribute: string }
  | { kind: "exclusion"; excludedCourseIds: string[]; child: RequirementNode }
  | { kind: "waiver"; waiverId: string; label: string }
  | { kind: "manualConfirmation"; label: string; sourceText: string };
```

Every normalized node retains source anchors. Unsupported advisor judgment becomes `manualConfirmation`; it is visible in the checklist but never automatically marked complete without an explicit user fact.

### 6.3 Programs

A program record includes:

- stable slug-derived ID
- official name and credential
- `major`, `minor`, or `core` type
- CIP code when present
- source URL and snapshot ID
- requirement root
- policies and declaration requirements
- sample plan as advisory content
- learning outcomes
- double-major or double-count constraints when deterministic

The planner initially exposes all degree-bearing majors. The imported model remains capable of storing minors for later activation without changing the source pipeline.

### 6.4 Courses

A course record includes:

- official ID, subject, title, and description
- `minCredits` and `maxCredits`
- raw credit text
- normalized offering terms when explicit
- raw offering text and an `unknown` state
- raw prerequisite text
- conservatively normalized linked-course prerequisite groups
- curriculum attributes
- grading basis and repeatability
- equivalencies and notes
- source URL, source snapshot, and source hash

Variable-credit placements store the student's selected credits. Unknown offering terms do not produce a false `not offered` warning.

### 6.5 Non-course fulfillment

The plan model gains explicit fulfillment facts for:

- placement or proficiency waivers
- accepted exam results
- advisor/manual confirmations

These facts can satisfy requirements without adding graduation credits. They remain separate from course placements.

## 7. Snapshot Persistence and Publication

### 7.1 Snapshot records

Each synchronization creates a snapshot with:

- unique ID
- catalog year
- status: `building`, `active`, `retired`, or `failed`
- started/completed timestamps
- source counts and hashes
- validation report
- failure summary when applicable

Courses, programs, source documents, and normalized requirements reference the snapshot ID.

### 7.2 Atomic activation

Publication runs inside one database transaction:

1. Insert the fully validated candidate records.
2. Mark the old active snapshot `retired`.
3. Mark the candidate `active`.
4. Commit.

Readers query only the active snapshot. Any exception rolls back the activation and leaves the prior snapshot untouched.

### 7.3 Validation gates

The candidate must satisfy all gates:

- program and course indexes parse with the expected page identity
- every discovered detail page fetches successfully
- discovered sets cross-check with sitemap entries
- course IDs and program IDs are unique
- every course block has a code and title
- credits parse as an exact value or range
- requirement table order and row roles are preserved
- linked references resolve locally or are explicitly classified as external NYU courses
- normalized records pass Zod validation
- no executable requirement references a missing node
- no snapshot activates with zero majors, zero subjects, or zero courses

Validation reports warnings separately from publication-blocking errors. Ambiguous official content that is faithfully represented as raw text or `manualConfirmation` is a warning, not an error.

## 8. Synchronization Interfaces

- `npm run bulletin:sync`: production and local CLI entry point.
- `POST /api/admin/bulletin/sync`: authenticated admin trigger.
- `GET /api/admin/bulletin/status`: active snapshot and recent run diagnostics.
- Deployment scheduler: recommended daily invocation; unchanged hashes make the run a no-op.

`GET /api/catalog` returns one coherent reference-data response:

```ts
type CatalogResponse = {
  snapshot: {
    id: string;
    catalogYear: string;
    publishedAt: string;
  };
  courses: Course[];
  programs: Program[];
  activeRules: SpecialRule[];
};
```

The bundled fallback becomes a generated last-known-good snapshot, not a separately curated truth source.

## 9. Confirmed Repairs

### 9.1 Plan import and persistence

- Add `expectedGrade` to the versioned plan-import placement schema.
- Preserve selected credits for variable-credit placements.
- Add a database uniqueness guarantee for the active plan per user.
- Make save use an atomic upsert rather than read-then-insert.
- Make `getActivePlan` respect active-plan semantics.

### 9.2 Authentication and paid endpoints

- Register the console magic-link provider only in development.
- Require authentication and appropriate authorization for paid AI parsing.
- Remove Albert actions from the primary student/admin workflow without spending this release on Albert connectivity.

### 9.3 Referential integrity

- Prevent deletion of a shared course referenced by an active program requirement, special rule, or persisted plan unless the caller performs an explicit migration.
- Snapshot retirement replaces destructive Bulletin deletions; historical plans continue to retain provenance.

### 9.4 Derived-state performance

- Compute allocation, progress, warnings, and feasibility once in a shared provider keyed by relevant catalog and plan state.
- Course catalog cards, semester course rows, and progress components consume focused selectors instead of invoking the full derivation pipeline independently.
- Feasibility may be computed lazily when its panel/dialog opens if profiling shows it remains the dominant cost.

### 9.5 Honest feasibility messaging

The interface describes feasibility results as guidance generated by a greedy scheduler. It does not state that an unsuccessful search proves no valid plan exists.

## 10. Academic Workspace UX

### 10.1 Wide-screen structure

```text
sticky product header
inspiration strip
course catalog rail | one-column semester timeline | degree-progress rail
```

At `1440px` and above, the workspace uses approximately:

- 340px course rail
- flexible timeline with a practical minimum around 620px
- 360px progress rail

Both rails are sticky and independently bounded. The timeline is the main document flow.

### 10.2 Header

The approximately 68px sticky header contains:

- product identity and current degree plan
- degree-plan selector
- entry-year selector
- planned/required credit status
- visible `Guide` action
- theme and account controls
- `Plan actions` menu containing import, export, and reset

The Guide action is never hidden in the overflow menu.

### 10.3 Inspiration strip

The strip uses an original project-owned raster asset with:

- modern academic architecture
- early natural light
- subtle Shanghai urban context
- no logos, text, watermarks, or identifiable people
- sufficient negative space for copy

A restrained violet-to-transparent overlay maintains contrast. The image does not continue behind the working panels.

The strip displays a short original English aphorism, for example:

> Make room in your plan for the questions you cannot stop asking.

A curated set rotates randomly once per client session and remains stable through re-renders. A quiet refresh action selects another quote. Original copy avoids copyright and misattribution risks.

### 10.4 One-column semester timeline

The timeline renders eight semester surfaces in chronological order. Year dividers provide grouping without enclosing Fall and Spring inside another card.

Each semester surface includes:

- real term name and academic-year context
- current credits and load status
- Study Away selector
- completed control
- capstone indicator when relevant
- full-width course rows
- a teaching empty state

Course rows increase type size, vertical padding, and interaction target size. They retain code, title, selected credits, major allocation, expected grade, and warnings. Color is never the only warning channel.

Drag/drop remains available. The semester assignment menu remains an equal first-class path for touch, keyboard, and users who do not prefer dragging.

### 10.5 Course catalog

The expanded Bulletin catalog makes rendering every course card unsuitable. The catalog becomes search-first and uses a virtualized result list.

Filters include:

- active program requirement
- Core attribute
- subject
- offered term
- planned/unplanned
- custom courses

Search matches code, title, subject, and description keywords. Results show provenance and unknown offering states without fabricating availability.

### 10.6 Degree progress

The progress rail contains:

- planned and earned summary
- graduation credits
- program requirement groups
- manual confirmations and waivers
- double-count status
- warnings
- feasibility guidance entry point

Requirement groups use progressive disclosure. Manual-confirmation items show the exact source policy and a clear action instead of appearing as impossible missing courses.

## 11. Onboarding and Guide

After client hydration, first-time visitors automatically see a four-step dialog:

1. **Choose your program** — degree plan and entry year.
2. **Find courses** — search, filters, and requirement context.
3. **Build your timeline** — drag/drop and assignment menu.
4. **Read your progress** — planned versus earned, warnings, and heuristic feasibility.

Completion state is stored under `nyush-planner:onboarding:v1`. Guests and authenticated users receive the same first-visit behavior. Incrementing the version permits a future material onboarding update to run once again.

The dialog supports Skip, Back, Next, Done, Escape, correct focus trapping/restoration, and reduced motion. The header Guide action reopens the same flow at any time.

## 12. Visual System

### 12.1 Color

- Preserve NYU violet as the primary action and selection color.
- Replace the violet-tinted canvas with a neutral near-white surface carrying only slight brand-hue chroma.
- Use deep graphite for primary text.
- Use green for success/completion, amber for warnings, and red for errors.
- Define complete hover, focus, active, disabled, loading, error, warning, success, and info states.
- Maintain WCAG AA contrast for body, muted, placeholder, and control text.

### 12.2 Typography

- Use Geist Sans for the full product interface.
- Use Geist Mono only for course codes and compact technical values.
- Raise default UI copy toward 15–16px.
- Use a compact fixed type scale suitable for a product workspace.
- Keep headings balanced and prose within readable line lengths.

### 12.3 Shape, spacing, and elevation

- Use 12–16px radii for major surfaces.
- Avoid nested card stacks.
- Use borders or tight low-blur shadows, not both decoratively.
- Increase semester and rail padding, row height, and section rhythm.
- Keep all primary interaction targets at least 44px.

### 12.4 Motion

- Keep state transitions between 150 and 220ms.
- Use motion for dialogs, sheets, selection, drag feedback, and state changes only.
- Do not orchestrate page-load animation.
- Supply `prefers-reduced-motion` alternatives for every transition.

## 13. Responsive Behavior

### 13.1 1440px and above

Three-column workspace: sticky catalog, one-column timeline, sticky progress.

### 13.2 1024–1439px

Catalog plus timeline. Progress opens in a right-side sheet and remains reachable from a persistent action.

### 13.3 Below 1024px

Timeline is the primary page. Courses and Progress open as sheets from persistent tool actions.

### 13.4 Mobile

- Compact header while keeping Guide reachable.
- Full-width semester surfaces and stacked course-row content.
- Assignment menus provide complete functionality without drag/drop.
- Dialog and sheet content respects safe areas and viewport keyboard changes.

## 14. Accessibility

- Semantic headings preserve program, year, and semester hierarchy.
- All dialogs and sheets manage focus and announce titles/descriptions.
- Drag actions have menu/keyboard equivalents.
- Warnings use icons and text in addition to color.
- Course remove actions remain visible on keyboard focus, not only hover.
- Empty, loading, error, and synchronization states use actionable language.
- Background imagery is decorative and receives empty alternative text; quote text remains real HTML.

## 15. Error Handling

### 15.1 Synchronization

- Record a failed run with stage, URL, error category, and safe diagnostic message.
- Keep the old snapshot active.
- Show recent run status in the admin interface.
- Do not return an empty successful catalog when an active snapshot exists.

### 15.2 Client reference data

- Render skeletons while loading a remote snapshot.
- Fall back to the generated last-known-good bundled snapshot on network failure.
- Display catalog version/provenance where users inspect requirement details.

### 15.3 Plan migration

- Validate plans against the current active snapshot without deleting unknown historical placements.
- Mark retired or unresolved courses clearly and offer migration guidance.
- Preserve raw user facts through snapshot changes.

## 16. Verification Strategy

Implementation follows red-green-refactor TDD.

Backend coverage includes:

- index discovery fixtures
- course block parsing fixtures
- STEM and non-STEM program requirement fixtures
- Core requirement and waiver fixtures
- credit-range and unknown-offering cases
- ambiguous prerequisite preservation
- source-to-AST normalization
- validation gate failures
- transactional activation and rollback
- catalog API snapshot coherence
- active-plan uniqueness and grade preservation
- authorization and deletion guards

Frontend coverage includes:

- eight semesters in one chronological column
- onboarding first-visit and reopen behavior
- session-stable quote selection and refresh
- responsive rail/sheet switching
- variable-credit placement controls
- manual-confirmation requirement states
- focused derived-state consumers
- keyboard alternatives and focus restoration

Final verification includes tests, lint, TypeScript, a clean production build, responsive browser screenshots, keyboard navigation, contrast checks, and reduced-motion inspection.

## 17. Rollout

1. Add new source and normalized schemas behind existing APIs.
2. Build parser fixtures and candidate validation without changing the active catalog.
3. Import and inspect a complete Bulletin snapshot in development.
4. Activate snapshot-backed catalog/program reads.
5. Generate the bundled last-known-good fallback.
6. Ship plan migrations and confirmed backend repairs.
7. Ship the Academic Workspace against the new catalog response.
8. Enable the deployment scheduler after a successful production dry run.

## 18. Future Correction and Addition Workflow

A later release may add:

```text
student correction/addition request
  -> review queue
  -> approved source overlay
  -> versioned publication
```

This workflow must not mutate scraped source documents. Approved changes should be stored as attributed overlays or amendments so official source data, local corrections, and publication history remain distinguishable.

## 19. Approval Record

- Automatic publication of valid Bulletin snapshots: approved.
- English-only interface: approved.
- Versioned snapshot architecture: approved.
- Academic Workspace direction: approved.
- Detailed backend design: approved.
- Detailed frontend/onboarding/visual design: approved.
