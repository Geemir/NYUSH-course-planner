# NYUSH Course Planner v0.2 Product Design

**Date:** 2026-07-17

**Status:** Approved

**Product language:** English

**Degree-audit authority:** NYU Shanghai Undergraduate Bulletin and reviewed
NYUSH planner overlays

**Additional catalog source:** NYU New York undergraduate school Bulletins

## 1. Summary

v0.2 keeps the product focused on students enrolled at NYU Shanghai. It expands
the course catalog with New York undergraduate courses for study-away planning,
but it does not become a degree planner for students enrolled in New York
schools. NYUSH programs and reviewed NYUSH mappings remain the only inputs to
degree-progress calculations.

The release adds a structured Program Profile for a primary major, an optional
second major, and minors; a student-to-maintainer Correction Hub; query-driven
catalog discovery; safer plan synchronization and Undo; and an Apple-inspired
visual system called **NYU Academic Glass**. NYU violet remains the product's
brand anchor. Apple influence is limited to craft, typography, materials,
motion, control behavior, and accessibility rather than brand imitation.

## 2. Product Boundary

### 2.1 Authoritative degree scope

- The planner audits NYU Shanghai Core, major, second-major, and minor
  requirements only.
- New York school degree programs, credentials, and school cores are not
  selectable programs and are not normalized into executable degree audits.
- A New York course counts toward an NYUSH requirement only when the active
  NYUSH requirement data or a reviewed fulfillment overlay says that it does.
- A New York course without such a mapping remains a study-away elective and
  contributes only according to verified NYUSH graduation-credit policy.

### 2.2 Catalog does not mean availability

The Bulletin is a catalog inventory. A Bulletin record does not establish that
a course:

- will be offered in a particular semester;
- has open seats;
- is available to an NYU Shanghai student;
- satisfies current registration restrictions or prerequisites in Albert; or
- fulfills an NYUSH degree requirement.

Every New York record therefore exposes a clear state equivalent to **Catalog
course — current availability and registration eligibility not confirmed**.
Offering and eligibility claims remain out of scope until a later authoritative
scheduling source is integrated.

### 2.3 New York source coverage

v0.2 GA covers the undergraduate course inventories exposed by the 13 New York
school sections listed by the central Undergraduate Bulletin after excluding
NYU Shanghai and NYU Abu Dhabi:

1. College of Arts and Science
2. College of Dentistry
3. Gallatin School of Individualized Study
4. Leonard N. Stern School of Business
5. Liberal Studies
6. Robert F. Wagner Graduate School of Public Service
7. Rory Meyers College of Nursing
8. School of Global Public Health
9. School of Professional Studies
10. Silver School of Social Work
11. Steinhardt School of Culture, Education, and Human Development
12. Tandon School of Engineering
13. Tisch School of the Arts

Adapters are validated internally with CAS, Stern, and Tandon first, then rolled
out to the remaining configured sources. The staged implementation does not
reduce the v0.2 GA coverage requirement.

## 3. Goals

- Make New York undergraduate catalog courses searchable and usable in NYUSH
  study-away plans.
- Preserve source school, catalog year, canonical URL, source snapshot, and
  normalization provenance for every imported record.
- Allow independent school refreshes without allowing one failed source to
  deactivate healthy Shanghai or New York data.
- Keep initial planner bootstrap small by moving large-catalog discovery behind
  server-side search, filtering, and pagination.
- Give students a clear, structured way to select one primary major, an
  optional second major, and NYUSH minors.
- Make double-counting, ambiguous allocation, and remaining requirements
  understandable rather than implicit.
- Let signed-in students report catalog and requirement issues and follow their
  resolution through an auditable planner-maintainer workflow.
- Preserve immutable Bulletin history while publishing approved corrections and
  fulfillment decisions through reviewable overlays.
- Make planning resilient to network failure, stale catalogs, migrations, and
  accidental destructive actions.
- Evolve the interface into a mature NYU-branded product with native-feeling
  typography, coherent icons and buttons, functional glass, and restrained
  motion.

## 4. Non-goals

- Degree audits for students enrolled in New York schools.
- Automatic parsing or execution of New York program requirements.
- Albert connectivity, live section schedules, seats, instructors, meeting
  times, registration eligibility, or waitlists.
- Claiming that a planner-maintainer decision is an official NYU petition,
  advisor approval, registration authorization, or degree certification.
- Automatically auditing an NYU cross-school minor without a reviewed NYUSH
  mapping.
- Email delivery, file attachments, or external ticket-system integration for
  Correction Hub reports.
- Replacing Lucide with copied SF Symbols or distributing Apple-proprietary
  fonts.
- Applying transparency to every surface or adding decorative page-load motion.
- Multi-scenario plan comparison, advisor portals, or collaborative editing.

## 5. Catalog Architecture

### 5.1 Three layers of truth

The catalog separates three concerns:

1. **Immutable source captures** preserve fetched Bulletin content, canonical
   URLs, hashes, timestamps, and structural evidence.
2. **Normalized source snapshots** expose typed courses and NYUSH programs from
   one school/source at one catalog version.
3. **Reviewed overlays** apply planner-maintainer corrections and NYUSH
   fulfillment decisions without rewriting source history.

The active catalog is a versioned release composed from one healthy normalized
snapshot per configured source plus the overlays effective for that release.

### 5.2 Proposed persistence concepts

```ts
type CatalogSource = {
  id: string;
  campus: "shanghai" | "new-york";
  schoolCode: string;
  title: string;
  baseUrl: string;
  enabled: boolean;
};

type CatalogSourceSnapshot = {
  id: string;
  sourceId: string;
  catalogYear: string;
  status: "building" | "healthy" | "failed" | "retired";
  sourceHash: string;
  validationReport: unknown;
  documentCount: number;
  courseCount: number;
  programCount: number;
  startedAt: string;
  completedAt?: string;
};

type CatalogRelease = {
  id: string;
  status: "building" | "active" | "retired" | "failed";
  publishedAt?: string;
  sources: Array<{
    sourceId: string;
    sourceSnapshotId: string;
  }>;
};
```

Normalized documents, courses, and Shanghai programs reference a source
snapshot. A release-to-source join composes the active read model. Readers never
select a partially built release.

### 5.3 Course identity and provenance

An internal stable course identity is namespaced by authoritative source and
official course code. The displayed official code remains unchanged. The model
stores cross-list and equivalency edges separately so aliases do not silently
collapse distinct source records.

Each normalized course supports:

- stable internal ID and official course code;
- title, description, subject, school, and campus;
- catalog year and canonical source URL;
- exact or ranged credits plus raw credit text;
- optional numeric/semantic level;
- raw and normalized offering information;
- raw prerequisite and corequisite text;
- conservatively normalized linked-course references;
- unresolved external references retained by canonical code and provenance;
- grading basis and repeatability when published;
- cross-list/equivalency relationships;
- source snapshot and content hash; and
- catalog-only availability state.

Prerequisites may reference courses from another NYU campus or school. Such
references remain visible and unresolved until a source in the same release can
resolve them. They are never discarded solely because the current source does
not own the target.

### 5.4 Overlay model

Two reviewed overlay families remain distinct:

- **Catalog correction:** a schema-validated field correction or additional
  record attached to a stable source entity.
- **NYUSH fulfillment mapping:** an NYUSH decision that maps a course or
  reviewed external experience to a program/category requirement.

An overlay records its evidence, authoring report, reviewer, effective release
boundary, status, creation/application timestamps, and supersession reason.
When a newer Bulletin snapshot changes the affected source data, the overlay is
re-evaluated and marked applicable, obsolete, or conflicting. Conflicting
overlays return to review rather than being silently discarded.

## 6. Discovery, Synchronization, and Publication

### 6.1 School-aware discovery

The central Undergraduate Bulletin supplies the configured school boundary.
Each source adapter verifies its school identity and discovers subject pages
from that school's course inventory. The global Courses A-Z index is a
reconciliation aid, not the inclusion authority, because it mixes campuses,
levels, and professional/graduate content.

The source registry supplies canonical school roots and expected index kinds.
Course-code suffixes may assist validation but are not treated as sufficient
proof of school, level, or eligibility.

A course is included only when it is listed through the configured
undergraduate source boundary and passes that source adapter's undergraduate
classification rules. A record explicitly identified as graduate-level is
excluded even when it appears on a shared subject page. A record whose level
cannot be classified safely is quarantined in validation diagnostics rather
than published through a guess. Graduate codes that appear only inside an
undergraduate course's prerequisite text remain preserved as external
references.

### 6.2 Source pipeline

```text
discover one school
  -> fetch its complete allowed page set
  -> parse lossless source documents
  -> normalize school-aware course records
  -> validate candidate source snapshot
  -> store healthy source snapshot
  -> compose release with last-known-good snapshots from other sources
  -> atomically activate release
```

Network access remains injectable so parser and publication tests use checked-in
fixtures. Per-source locks prevent concurrent refreshes for the same school; a
short release-composition lock prevents two active releases from publishing at
once.

### 6.3 Validation and anomaly gates

A source update cannot publish when it has:

- an unverifiable school or index identity;
- an unexpected redirect or host;
- incomplete discovered-page fetching;
- zero subjects or zero courses where the source previously contained them;
- missing required course codes, titles, or credit values;
- duplicate namespaced course IDs;
- invalid canonical URLs;
- structural selector misses presented as successful empty results;
- schema-invalid normalized records;
- unexplained large count drops or unresolved-reference spikes; or
- a validation error classified as publication-blocking.

Warnings preserve faithful ambiguity without blocking publication. Examples
include unknown offering terms, external prerequisites, and metadata that a
school does not publish.

### 6.4 Automatic publication and failure behavior

A healthy changed source snapshot automatically creates and activates a new
catalog release containing that snapshot plus the last-known-good healthy
snapshot for every other configured source. A failed refresh creates diagnostics
but no new active source snapshot.

The initial v0.2 GA release is blocked until Shanghai and all 13 configured New
York school inventories have a healthy snapshot. Subsequent isolated failures
retain the last-known-good snapshot and expose a stale-source status to
administrators. Release rollback selects a previously active composition in one
transaction.

## 7. Catalog APIs and Discovery UX

### 7.1 Bootstrap and search separation

The planner bootstrap response contains only:

- active release identity and publication time;
- NYUSH programs and executable requirement metadata;
- source/school filter metadata;
- site metadata;
- active reviewed overlays needed for the loaded plan; and
- small planner configuration data.

Courses are retrieved through a bounded query API rather than embedded in the
complete bootstrap response.

### 7.2 Course search contract

Search supports:

- free-text course code/title/description query;
- campus/site and school;
- subject;
- undergraduate level when published;
- credit value/range;
- offering term only as catalog metadata; and
- NYUSH fulfillment state.

Responses are paginated with stable sorting and a cursor or equivalent stable
continuation token. Parameters are schema-validated and capped. Course details
load by stable release-aware ID.

The interface distinguishes loading, no results, service failure, stale source,
and partial source-health states. It never replaces a service error with a false
empty result.

### 7.3 Course-detail trust signals

Course details show:

- source school and campus;
- Bulletin/catalog year;
- canonical source link;
- catalog release publication time;
- catalog-only availability disclaimer;
- NYUSH fulfillment status and evidence where mapped;
- active planner correction disclosure where applicable; and
- a contextual **Report an issue** action.

The existing local override action is renamed from **Edit course** to
**Customize for my plan** so it cannot be mistaken for an official catalog
edit.

## 8. Program Profile and Plan Snapshot v2

### 8.1 Structured profile

```ts
type ProgramProfile = {
  coreProgramId: string;
  primaryMajorId: string;
  secondMajorId?: string;
  minorIds: string[];
};
```

Core is always active. A valid profile has exactly one primary NYUSH major, no
more than one second NYUSH major, and any number of distinct NYUSH minors unless
an official policy provides a limit. The same program cannot occupy more than
one role.

New York degree programs are not selectable. A reviewed cross-school program or
minor may be represented by an overlay/manual requirement record, but it is not
automatically audited from the New York Bulletin.

### 8.2 Program Profile surface

The crowded degree-plan selector is replaced by a compact header summary such
as **Computer Science + IMA · 1 minor**. It opens a dedicated side sheet on wide
screens and a focused full-screen sheet on small screens.

The sheet provides searchable selection, requirement previews, combination
warnings, and a before/after impact summary. Confirmed official policy
violations block saving. Uncertain or advisor-dependent combinations produce
clear guidance without pretending to make an official decision.

### 8.3 Progress and double-counting

Progress is grouped separately for Core, primary major, second major, and each
minor. Every group distinguishes completed, planned, remaining, manually
confirmed, and unresolved work.

Shared courses expose:

- current automatic allocation;
- the applicable double-count budget when deterministic;
- which programs receive credit;
- why the course is ambiguous; and
- manual allocation to one or both programs only when permitted.

Course details explain why a course counts or does not count. A New York course
without a reviewed mapping remains an elective even when its title resembles an
NYUSH requirement.

### 8.4 Plan snapshot v2 and migration

Plan snapshot v2 stores:

- the structured Program Profile;
- the catalog release ID used for reconciliation;
- existing placements, study-away sites, selected credits, grades, allocations,
  fulfillment facts, warnings, custom courses, and start year;
- a revision/version token for safe synchronization; and
- a schema version.

Migration creates a local backup of the v0.1 snapshot before modifying state.
Recognized legacy program IDs are assigned to their only unambiguous roles, and
all valid placements remain intact. An ambiguous legacy combination opens a
small resolution flow rather than guessing. Migration is idempotent and can be
re-run safely after an interrupted load.

## 9. Correction Hub

### 9.1 Boundary and entry points

The Correction Hub belongs to the planner maintainers. Every submission and
decision surface states that it is not an official NYU petition, advisor
approval, registration authorization, or degree certification.

Signed-in students can enter from:

- **Report an issue** in a course or program detail surface; or
- **Help -> My reports** for a missing record or broader catalog issue.

### 9.2 Report types

- Incorrect course information
- Missing course
- Incorrect or missing NYUSH program requirement
- Request planner-side NYUSH fulfillment review
- Duplicate, cross-listed, or equivalency problem
- Other catalog problem

The form captures the affected stable entity, release, source snapshot, current
displayed value, school, canonical URL, issue type, explanation, proposed
correction, and optional supporting URLs. v0.2 accepts text and links only.

### 9.3 Persistence and audit concepts

```ts
type CorrectionStatus =
  | "submitted"
  | "in_review"
  | "needs_information"
  | "approved"
  | "rejected"
  | "applied";
```

A correction request stores author, target context, issue type, proposal,
evidence, current status, and timestamps. Messages support requests for more
information. Immutable events record every transition, actor, reason, duplicate
merge, reviewer decision, and overlay application.

Students can see their own report timeline, respond to a request for
information, and withdraw an unresolved submission. They cannot inspect other
students' reports or internal reviewer notes.

### 9.4 Administrator workflow

The Correction Inbox supports filters by status, issue type, school, source,
age, and assignee. Reviewers see the source record and proposal side by side,
can merge duplicates, request information, record internal notes, and approve or
reject with a reason.

Approval and application are distinct actions. Application validates the
resulting overlay and publishes it atomically. An applied report links to the
overlay and effective catalog release.

### 9.5 Notifications

v0.2 provides in-app unread indicators and status notifications. Email delivery
is deferred until the product has a monitored, reliable mail service.

## 10. NYU Academic Glass Visual System

### 10.1 Direction

The design combines NYU identity with native-feeling interaction quality. NYU
violet remains primary for actions, focus, selection, and progress. Plum,
lavender, warm light neutrals, and deep violet-black create supporting depth.
Semantic green, amber, and red are reserved for completion, warning, and error.

The system must look like an NYU academic product, not an Apple marketing-page
clone.

### 10.2 Typography

The primary sans stack uses the operating-system UI font, beginning with
`-apple-system` and `BlinkMacSystemFont` on Apple platforms and `Segoe UI` on
Windows, followed by standards-based fallbacks. The existing recursive
`--font-sans` mapping is corrected.

Typography uses a small deliberate scale, optical sizing where supported,
size-aware tracking, and restrained weights:

- 400 for reading text;
- 500 for controls and labels; and
- 600 for headings and key totals.

Course codes and requirement identifiers retain a compact monospaced stack.
Proprietary Apple font files are not distributed.

### 10.3 Icons

Lucide remains the icon family. Components standardize role-based 16, 18, 20,
and 24px sizes, consistent stroke weight near 1.75px, optical alignment, and
selected-state containers. Familiar actions may be icon-only only when they
have accessible names and tooltips. Unfamiliar or consequential actions include
visible text.

### 10.4 Buttons and controls

The component system defines:

- solid NYU-violet primary actions;
- violet-tinted or outlined secondary actions;
- quiet tertiary text/icon actions;
- semantic destructive actions; and
- compact, default, and touch-safe sizing, including a 44px touch target where
  appropriate.

Pointer-down feedback is immediate through restrained scale/material change.
Rounded rectangles are the default; pills are reserved for filters, chips, and
segmented controls.

### 10.5 Functional liquid glass

Glass is limited to floating or transient hierarchy:

- sticky/floating product header;
- mobile toolbar;
- popovers and menus;
- sheets and dialog chrome; and
- transient grouped controls.

It may use a subtle violet tint/refraction, backdrop blur, a translucent border,
and controlled shadow. Semester containers, course cards, dense lists, and
progress content remain opaque. Glass-on-glass stacking is prohibited.

Reduced-transparency, increased-contrast, forced-colors, and unsupported-browser
fallbacks replace translucent materials with opaque tokens while preserving
hierarchy.

### 10.6 Motion

Controls respond immediately, generally within 120-180ms. Sheets and dialogs use
interruptible spring-like transitions around 220-320ms. Course dragging and
drops remain spatially coherent and reversible. Where practical, Program
Profile and detail sheets expand from their originating controls.

Motion begins from the current presentation value, does not delay user input,
and has symmetric enter/exit behavior. Decorative page-load choreography is not
allowed. Reduced-motion mode keeps useful state feedback through short fades.

A general motion dependency is added only if the interactive prototype proves
that CSS, Base UI, and the existing drag runtime cannot provide the required
interruption or gesture behavior.

### 10.7 Layout and atmosphere

The approved one-column eight-semester timeline remains the main document flow.
Desktop course and progress rails remain supporting surfaces; mobile rails
become focused sheets. Components gain more deliberate scale and spacing without
removing useful academic information.

The existing New York skyline image remains an inspiration band with a
violet-black contrast treatment. It does not sit behind dense interactive
content. Program Profile, Undo, and sync state become compact utilities rather
than additional header dropdowns.

### 10.8 Prototype gate

Before system-wide rollout, one interactive prototype covers:

- floating header and representative glass fallbacks;
- primary, secondary, tertiary, icon, and destructive controls;
- course drag/drop and Undo;
- Program Profile sheet;
- course detail/report entry; and
- mobile toolbar and sheet behavior.

It must be reviewed in light/dark modes, keyboard-only use, reduced motion,
reduced transparency, increased contrast, forced colors where practical, and a
representative low-powered device/profile.

## 11. Plan Safety and Synchronization

Plan mutations write locally first. Signed-in synchronization exposes explicit
**Saving**, **Saved**, **Offline**, and **Couldn't sync** states rather than
swallowing failures.

Saves are idempotent and revision-aware. A stale client cannot silently
overwrite a newer server revision. When automatic reconciliation is unsafe, the
student sees the two versions and chooses which plan to retain; both remain
recoverable until the choice is complete.

The planner retains bounded Undo history for course placement, movement,
removal, Program Profile changes, and reset. Undo is surfaced contextually after
destructive actions and remains keyboard accessible. It does not cross an
explicit plan import boundary unless the imported snapshot is retained as the
recoverable previous state.

## 12. Security, Privacy, and Authorization

- Catalog reads remain public unless an existing product policy requires
  authentication.
- Plan, report, message, and notification reads are scoped to the signed-in
  owner.
- Administrator actions require the existing administrator authorization model
  and are checked server-side for every route.
- Correction status transitions are validated against an explicit transition
  graph; the client cannot choose arbitrary states.
- Report submission and search endpoints are rate-limited and bounded.
- Evidence URLs accept approved protocols and are escaped when rendered.
- User-written report content is not interpolated into executable instructions
  or trusted HTML.
- Operational logs avoid plan contents and report text unless required for a
  specific, access-controlled diagnostic event.
- Audit events are append-only through application behavior.

## 13. Error and Empty States

The product distinguishes and explains:

- catalog search loading;
- valid zero results;
- one stale school source;
- a temporarily unavailable search service;
- a locally saved but unsynchronized plan;
- a server revision conflict;
- a plan migration requiring student input;
- a report awaiting information;
- an overlay conflicting with a new Bulletin release; and
- an administrator source refresh or publication failure.

Errors retain the user's query, form text, plan state, or unfinished selection
where safe. Retry actions are local to the failed operation. A stale but healthy
last-known-good catalog is labeled; it is not replaced by an empty catalog.

## 14. Verification Strategy

### 14.1 Data and backend

- Checked-in parser fixtures cover every configured school structure.
- Discovery tests assert school/index identity and URL allowlists.
- Parser tests cover exact/ranged credits, offerings, levels, grading,
  repeatability, prerequisites, cross-lists, and missing optional metadata.
- Normalization tests preserve unresolved cross-source references.
- Validation tests prove structural misses and anomalous deletions cannot
  publish.
- Repository tests prove independent source activation, release composition,
  atomic activation, last-known-good retention, and rollback.
- Overlay tests cover effective boundaries, supersession, conflicts, and
  source-release re-evaluation.
- Search contract tests cover bounds, pagination, stable sorting, filters, and
  authorization where applicable.

### 14.2 Program and plan

- Program Profile tests cover role uniqueness, double-major selection, minors,
  invalid combinations, and explanatory allocation.
- Migration tests cover empty, single-major, double-major, minor, custom-course,
  variable-credit, fulfillment-fact, and ambiguous legacy plans.
- Sync tests cover offline writes, retry, idempotency, stale revisions, and
  conflict recovery.
- Undo tests cover every supported mutation and its sync boundary.

### 14.3 Correction Hub

- Authorization tests prove students can access only their own reports.
- Transition tests cover every allowed and forbidden status change.
- Audit tests prove actor, time, reason, and application links are retained.
- Rate-limit, URL-validation, duplicate, and content-safety tests cover
  untrusted submissions.
- Application tests prove an approved report does not change the catalog until
  the explicit overlay action succeeds.

### 14.4 Frontend and accessibility

- Component tests cover Program Profile, search states, provenance, reporting,
  notifications, Undo, and sync status.
- End-to-end tests cover first visit, New York course discovery, study-away
  placement, double-major setup, report submission/review/application, offline
  plan recovery, migration, and rollback smoke behavior.
- Every drag operation has a keyboard-accessible equivalent.
- Automated checks and manual review target WCAG 2.2 AA contrast, focus order,
  names/roles, target sizes, zoom, reduced motion, transparency fallback, and
  increased contrast.
- Visual regression covers light, dark, fallback materials, common responsive
  widths, and the representative interactive prototype.
- Performance profiling measures initial bootstrap, search interaction, scroll,
  drag/drop, blur, and sheet animation before budgets are frozen for GA.

## 15. Rollout Plan

1. Add the multi-source schema, source registry, source snapshots, release
   composition, and rollback behavior behind internal controls.
2. Implement and validate CAS, Stern, and Tandon adapters with production-shaped
   fixtures.
3. Add the remaining ten New York school adapters and establish a complete
   internal release.
4. Introduce bootstrap/search separation and migrate catalog consumers to the
   query API.
5. Add Program Profile, requirement explanations, plan snapshot v2, migration,
   sync status, and Undo.
6. Add Correction Hub persistence, student surfaces, administrator Inbox,
   notifications, and overlay application.
7. Build and review the NYU Academic Glass prototype.
8. Apply the approved visual system across the product after the prototype gate.
9. Rehearse production migration, source failure, release rollback, plan
   conflict, and overlay conflict recovery.
10. Complete accessibility, performance, automated verification, and production
    smoke gates before v0.2 GA.

Partial New York coverage may be exposed only as an explicitly internal or
pre-release state. The public v0.2 GA claim requires all configured sources.

## 16. GA Acceptance Criteria

v0.2 is ready for general availability only when:

- NYU Shanghai and all 13 configured New York school course inventories have a
  healthy source snapshot in the active release;
- a failed school refresh demonstrably preserves every last-known-good source;
- release activation and rollback are atomic and have been rehearsed;
- New York course details show provenance and the catalog-only availability
  boundary;
- the initial planner response no longer delivers the complete New York course
  catalog;
- search is paginated, bounded, stable, and usable across supported responsive
  widths;
- degree progress uses only NYUSH programs and reviewed overlays;
- students can configure a primary major, optional second major, and NYUSH
  minors and understand double-counting outcomes;
- v0.1 plans migrate without losing valid placements or fulfillment data;
- local-first persistence, visible sync state, conflicts, and Undo pass
  end-to-end verification;
- students can submit and track a report while administrators can review,
  decide, audit, and apply an overlay;
- the Correction Hub clearly disclaims official NYU authority;
- the NYU Academic Glass prototype passes its material, motion, keyboard,
  accessibility, and performance gates;
- there are no unresolved critical accessibility or security findings;
- lint, type checking/build, unit, integration, component, and end-to-end suites
  pass in the release environment; and
- production smoke and rollback checks pass against the release candidate.

## 17. Source References

- NYU Undergraduate Bulletins: <https://bulletins.nyu.edu/undergraduate/>
- NYU Shanghai Undergraduate Bulletin:
  <https://bulletins.nyu.edu/undergraduate/shanghai/>
- NYU Shanghai registration guidance:
  <https://shanghai.nyu.edu/content/registration-guidance>
- Referenced Apple-design skill:
  <https://github.com/emilkowalski/skills/tree/main/skills/apple-design>
