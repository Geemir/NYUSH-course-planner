# Task Plan: NYUSH Course Planner v0.2 Discovery and Design

## Goal

Define an approved v0.2 product design that expands the catalog to NYU New York,
adds missing academic-program and correction workflows, and evolves the existing
Academic Workspace into a restrained Apple-inspired product interface without
sacrificing accessibility, performance, or NYU identity.

## Current Phase

Phase 6

## Phases

### Phase 1: Restore context and audit current product coverage
- [x] Map the implemented Bulletin, planner, account, admin, and design-system surfaces
- [x] Compare previously promised features with actual routes, schemas, and UI
- [x] Identify missing capabilities and technical constraints relevant to v0.2
- **Status:** completed

### Phase 2: Research source and design references
- [x] Map the NYU undergraduate Bulletin hierarchy for New York schools, programs, and courses
- [x] Inspect the referenced Apple-design skill and extract applicable product-UI principles
- [x] Record data-volume, identifier, campus, policy, typography, icon, motion, and browser-support implications
- **Status:** completed

### Phase 3: Shape v0.2 scope and alternatives
- [x] Separate independent data, academic-program, correction, and visual-system workstreams
- [x] Propose two or three release approaches with trade-offs and a recommendation
- [x] Confirm the release boundary, priorities, and success criteria with the user one decision at a time
- **Status:** completed

### Phase 4: Present and validate the design
- [x] Present architecture, data model, workflows, UI system, error handling, and verification in reviewable sections
- [x] Obtain user approval for each section and revise disagreements
- **Status:** completed

### Phase 5: Write the approved specification
- [x] Save the approved v0.2 design under `docs/superpowers/specs/`
- [x] Self-review for placeholders, contradictions, ambiguity, and excessive scope
- [x] Commit the design specification and request user review
- **Status:** completed

### Phase 6: Produce implementation plans after spec approval
- [x] Split the approved specification into independently executable implementation plans
- [x] Include exact file ownership, interfaces, TDD steps, verification, and commit boundaries
- **Status:** completed

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Planning and research only in this phase | The user explicitly requested a plan before implementation |
| Preserve English as the product language | This was approved for v0.1 and has not been superseded |
| Treat NYU New York data, academic-program selection, correction workflow, and visual redesign as separable workstreams | They have distinct schemas, risks, and acceptance criteria and should not become one unreviewable implementation task |
| Keep single-agent execution | The user previously requested no multi-agent work, and no later instruction changed that constraint |
| Keep v0.2 focused on NYU Shanghai degree planning | New York courses support study-away exploration; New York school degree requirements remain out of scope |
| Keep NYUSH requirements as the only degree-audit authority | Bulletin course inventory does not establish NYUSH fulfillment, availability, or registration eligibility |
| Preserve NYU violet and supporting NYU colors | Apple-inspired quality should refine the product's materials, typography, motion, icons, and controls without erasing NYU identity |
| Support all 13 New York undergraduate school inventories by v0.2 GA | A staged internal rollout through CAS, Stern, and Tandon validates adapters without reducing the promised GA coverage |
| Publish a catalog release composed from independently refreshable school snapshots | One failed school refresh must not deactivate healthy Shanghai or New York data |
| Keep Bulletin data, normalized catalog data, and reviewed NYUSH overlays separate | This preserves provenance and allows reviewed corrections or fulfillment decisions without rewriting archived source truth |
| Replace arbitrary active-program IDs with a structured Program Profile | Core, a primary major, an optional second major, and minors need distinct semantics and clearer validation |
| Audit only NYUSH Bulletin programs automatically | New York and cross-school programs require an explicit reviewed mapping rather than silent degree-audit assumptions |
| Migrate saved plans to a catalog-release-aware snapshot | Existing placements must survive v0.2 while ambiguous legacy program combinations are resolved explicitly |
| Implement the Correction Hub as a planner-maintainer workflow | Its decisions improve this product but must not imply official NYU advising, petition, registration, or degree approval |
| Preserve immutable source snapshots and apply approved changes through overlays | Corrections remain attributable, reversible, and reviewable when a new Bulletin release arrives |
| Use in-app report notifications in v0.2 | Email delivery adds external infrastructure and reliability concerns that are not required for the first review workflow |
| Adopt the NYU Academic Glass visual direction | NYU violet remains the brand anchor while Apple-inspired craft improves hierarchy, controls, materials, and feedback |
| Use a platform system font stack and retain Lucide icons | This achieves native-feeling typography and consistent icons without distributing or copying proprietary Apple assets |
| Restrict liquid glass to floating and transient chrome | Opaque semester and course surfaces protect readability and avoid stacked-transparency noise |
| Require an interactive prototype before system-wide visual rollout | Motion, blur, drag behavior, fallbacks, and performance cannot be judged reliably from static styling alone |
| Retain last-known-good source data on failed or anomalous refreshes | Automatic publication remains safe only when each source update passes structural and semantic validation |
| Make plan persistence local-first with visible sync state and bounded Undo | Students must retain agency and avoid losing planning work during network, migration, or multi-device conflicts |
| Gate v0.2 GA on complete source coverage, migration rehearsal, accessibility, and rollback verification | The expanded data and UI should not launch on visual completion alone |

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| Combined skill read exceeded the tool output limit | 1 | Re-read every applicable skill independently and in complete chunks |
| Sandboxed public web/GitHub reads failed | 1 | Re-ran the read-only Agent Reach commands with approved external access |
| Combined research output exceeded the tool limit | 1 | Saved confirmed findings and continued with bounded page/source reads |
| Parallel school filtering emitted only one valid response | 1 | Preserved CAS evidence and switched to separate bounded school reads |
| Secondary icon count pattern returned no matches | 1 | Retained the valid primary count and direct component evidence |
| A combined source audit exceeded the model output context | 1 | Stopped the oversized read and resumed with one bounded subsystem at a time |
| The remembered `PlanSync` path was stale | 1 | Located the component with `rg --files` and continued from `src/components/PlanSync.tsx` |
| A findings patch matched mojibake rendered by PowerShell instead of the UTF-8 file text | 1 | Re-anchored the patch on stable ASCII section headings and applied the same update safely |
| Two log patches targeted a task-plan error row in the findings file | 2 | Corrected the file targets and applied the research and error updates separately |
| Agent Reach could not check for a newer release after three network retries | 1 | Recorded installed version v1.5.0; research results were already complete, so no retry was needed |
| The first specification assertion required a phrase split across two Markdown lines | 1 | Replaced the literal substring assertion with a whitespace-tolerant pattern and completed the review checks |
| PowerShell interpreted the literal `[...nextauth]` route path as a wildcard during line counting | 1 | Kept the valid file inventory and switched future reads of bracketed paths to `-LiteralPath` |
| Two PowerShell audits piped directly from a `foreach` statement and failed to parse | 2 | Collected loop results into an array before formatting and completed both audits |
| The first no-marker assertion matched the release plan's intentional command for finding unfinished markers | 1 | Excluded that inspection command from the assertion and verified the remaining plan content cleanly |
