# Task Plan: Bulletin Data Migration and Planner Redesign

## Goal
Replace the Albert-centered catalog path with an authoritative NYU Shanghai Bulletin ingestion design, repair confirmed application risks, and redesign the planner as a polished one-column semester workflow with onboarding and an academic visual identity.

## Current Phase
Phase 5

## Phases

### Phase 1: Restore context and define decision boundaries
- [x] Restore the completed codebase-exploration notes
- [x] Read the required workflow, research, testing, and product-design guidance
- [x] Confirm the one product/data-governance decision that materially changes implementation
- **Status:** complete

### Phase 2: Research the official Bulletin data source
- [x] Map the Shanghai undergraduate Bulletin hierarchy and major index
- [x] Inspect representative major requirement pages and course-detail pages
- [x] Identify stable selectors, identifiers, pagination/index behavior, and source-year metadata
- [x] Record failure modes, legal/operational constraints, and fixture candidates
- **Status:** complete

### Phase 3: Design backend and frontend architecture
- [x] Compare 2-3 ingestion and publishing approaches
- [x] Specify normalized requirement/course mappings, provenance, validation, diff/review, and refresh behavior
- [x] Specify the repaired backend/security/persistence behaviors
- [x] Specify the responsive planner layout, help entry point, first-visit onboarding, quote surface, and visual direction
- [x] Present the design in reviewable sections and obtain user approval
- **Status:** complete

### Phase 4: Write approved design specification and implementation plans
- [x] Save the approved design specification under `docs/superpowers/specs/`
- [x] Create separate test-driven implementation plans for Bulletin ingestion/backend repairs and UI redesign
- [x] Self-review both plans for requirement coverage, exact interfaces, and verification steps
- **Status:** complete

### Phase 5: Execute the approved backend plan
- [ ] Follow test-first cycles for scraper/parser, normalization, persistence, APIs, and confirmed bug fixes
- [ ] Verify fixtures, unit/integration tests, lint, types, and production build
- **Status:** in_progress

### Phase 6: Execute the approved frontend plan
- [ ] Follow test-first cycles for onboarding state, quote selection, layout behavior, and UI integration
- [ ] Generate and adopt the approved academic background asset
- [ ] Validate responsive behavior, accessibility, reduced motion, and live browser rendering
- [ ] Run final tests, lint, types, and production build
- **Status:** pending

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Keep research/design separate from implementation | The redesign and authoritative-data migration both change core product behavior and require an approved architecture first |
| Trust Bulletin content while distrusting transport and structure | NYU's content is authoritative, but partial responses, selector drift, and malformed HTML must still fail validation |
| Preserve all pre-existing worktree changes | The repository was already dirty before this task and those changes are user-owned |
| Use separate backend and frontend implementation plans | Each subsystem can be reviewed and verified independently |
| Publish valid Bulletin snapshots automatically | The Bulletin is the trusted authoritative content source; a complete validated snapshot can replace the active version atomically without a human approval queue |
| Keep structural validation and atomic rollback | Trust in NYU's content does not make network truncation, selector drift, duplicate IDs, or partial fetches safe to publish |
| Defer correction/contribution workflow | `申请勘误` / `申请增补` → review → modification is a future user-initiated governance feature, separate from official-source synchronization |
| Keep the redesigned interface in English | NYUSH students can comfortably use English, the official Bulletin source is English, and a single-language product avoids mixed-language hierarchy and unnecessary i18n scope |
| Use a versioned snapshot ingestion pipeline | Preserve lossless Bulletin source structures, derive supported executable rules, validate complete snapshots, and atomically publish without human review |
| Use the Academic Workspace visual direction | A restrained NYU-branded product workspace best balances academic atmosphere, larger proportions, and planning efficiency |
| Approve the detailed Bulletin backend design | Use public allowed pages, lossless source documents, an extensible requirement AST, conservative course normalization, complete-snapshot validation, and atomic automatic publication |
| Approve the detailed Academic Workspace design | Use a visible Guide, versioned onboarding, project-owned inspiration image, session-stable original aphorisms, one-column semesters, responsive supporting rails, and a restrained NYU visual system |
| Approve the written design specification | The committed specification matches the reviewed backend and Academic Workspace decisions and is ready to drive implementation planning |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Combined skill-file read exceeded output limits | 1 | Re-read every required skill in bounded, complete chunks |
| Agent Reach update check could not reach its update endpoint after three retries | 1 | Logged as non-blocking; current installed version is v1.5.0 and Bulletin research already succeeded |
| Combined planning-file patch missed a mojibake-rendered line | 1 | Split the patch into exact bounded updates and avoided relying on console-rendered mojibake text |
| Assumed a `SemesterCard.tsx` filename that does not exist | 1 | Enumerated the planner directory and read the actual `SemesterColumn.tsx` component |
| Initial sandboxed `git add` could not create `.git/index.lock` | 1 | Re-ran the narrowly scoped stage command with approved repository-write access |
| Design specification had three Markdown hard-break trailing spaces | 1 | Replaced them with blank-line-separated metadata before commit |
