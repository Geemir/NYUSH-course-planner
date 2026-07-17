# Progress Log: NYUSH Course Planner v0.2

## Session: 2026-07-17

### Phase 3: Shape v0.2 scope and alternatives

- **Status:** in progress
- Restored the completed v0.1 planning, research, verification, and commit context.
- Read the brainstorming, persistent planning, implementation-planning, Agent
  Reach, and Impeccable guidance required for this discovery pass.
- Confirmed that the working tree was clean before beginning v0.2 planning.
- Created a separate persistent v0.2 discovery workspace; no application code
  has been changed.
- Audited Bulletin constants/source interfaces, snapshot tables, program option
  generation, the planner header, and the current admin surface.
- Confirmed that minor and double-major state primitives mostly exist, but the
  live UI exposes only single-major options and no custom program editor.
- Confirmed that no correction submission or admin review workflow exists.
- Read the NYU undergraduate root, a representative New York school Bulletin,
  the global course A–Z index, and the referenced Apple-design skill through
  Agent Reach routes.
- Established that the global course index mixes levels/campuses and cannot be
  used as an indiscriminate New York ingestion allowlist.
- Extracted the Apple reference's applicable product principles while rejecting
  decorative all-over glass and non-functional animation.
- Confirmed that school Bulletins expose their own program and course indexes;
  CAS alone introduces joint/dual credentials beyond the current classifier.
- Completed the bounded Apple reference read, including typography,
  accessibility preferences, feedback categories, and prototyping guidance.
- Audited global design tokens, button primitives, icon usage, course/program
  schemas, study-away sites, and the full-catalog client delivery path.
- Identified catalog-payload scaling, program-kind, typography-token, semantic
  button sizing, and transparency/contrast fallback work for v0.2.
- Confirmed that plan sync exposes no live save/offline/error state and silently
  ignores autosave failures after initial load.
- Confirmed that plan mutations have no undo/redo history and version-1 saved
  plans do not record the catalog release that their program IDs came from.
- Confirmed with Stern and Tandon samples that school indexes share a discovery
  pattern but course metadata and level/cross-listing conventions vary.
- Confirmed that New York prerequisites can reference courses across Stern,
  Shanghai, Abu Dhabi, and Tandon, requiring preserved unresolved references
  and later cross-source reconciliation.
- Confirmed from current NYU Shanghai registration guidance that Bulletin data
  cannot imply term availability, eligibility, or degree fulfillment; v0.2 must
  label catalog-only New York records and keep Albert/official evaluation as the
  authority for those claims.
- Completed repository and source/design research; moved into release-boundary
  and approach selection without changing application code.
- Confirmed the app has drag transforms but no broad motion runtime; dependency
  choice should follow an interactive v0.2 prototype rather than precede it.
- User selected the recommended product boundary: NYUSH degree auditing remains
  authoritative, while New York courses are included for study-away planning.
- User confirmed that NYU colors must remain; Apple influence is limited to
  interaction quality, typography, materials, icons, control design, and motion.
- User approved the complete catalog architecture: all 13 New York school
  course inventories at v0.2 GA, staged adapter validation, independently
  refreshable source snapshots, composed releases, and separate reviewed
  overlays.
- Completed release-boundary selection and began section-by-section design
  validation with the Program Profile workflow next.
- User approved the Program Profile: Core plus a primary major, optional second
  major, NYUSH minors, explicit double-counting visibility, requirement
  explanations, and catalog-aware saved-plan migration.
- External or cross-school programs remain review-driven overlays rather than
  automatically imported degree audits.
- User approved the Correction Hub as a planner-maintainer review system with
  contextual reports, explicit states, student history, an admin inbox, audited
  overlays, and a clear non-official boundary.
- User approved NYU Academic Glass: NYU colors remain primary, system typography
  and standardized Lucide icons replace imitation, glass stays functional and
  limited, motion stays interruptible, and an interactive prototype gates the
  broader visual rollout.
- User approved the final reliability, verification, migration, and rollout
  section, including automatic validated publication, last-known-good source
  retention, local-first plans, Undo, security gates, and GA conditions.
- Completed section-by-section design validation and began consolidating the
  approved v0.2 specification; application code remains unchanged.
- Wrote the complete approved specification at
  `docs/superpowers/specs/2026-07-17-nyush-v0-2-product-design.md`.
- Self-reviewed the specification for scope contradictions, unresolved
  placeholders, source/authority ambiguity, heading completeness, and diff
  whitespace errors; all corrected checks pass.
- Tightened undergraduate inclusion rules so explicitly graduate records are
  excluded and ambiguous-level records are quarantined instead of guessed.
- Prepared the reviewed specification and persistent planning record for a
  dedicated design commit and user review checkpoint.

## Files created or modified

- `.planning/2026-07-17-v0-2-product-expansion/task_plan.md`
- `.planning/2026-07-17-v0-2-product-expansion/findings.md`
- `.planning/2026-07-17-v0-2-product-expansion/progress.md`

## Error log

| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-07-17 | Combined skill output was truncated | 1 | Re-read the required skill files independently and in bounded chunks |
| 2026-07-17 | Sandboxed GitHub CLI could not read its user config and Jina Reader could not connect | 1 | Re-ran the same read-only public research with approved external access |
| 2026-07-17 | Combined external research output was truncated | 1 | Persisted confirmed findings, then switched to bounded source-specific reads |
| 2026-07-17 | Parallel school-page filtering returned a non-zero result and emitted only the CAS response | 1 | Preserved the valid CAS evidence and changed to independent bounded reads |
| 2026-07-17 | A secondary icon-import count pattern returned no matches and made the combined audit command exit 1 | 1 | Used the successful primary import count and direct source inspection; no retry needed |
| 2026-07-17 | A combined audit of discovery, sync, planner, and persistence files exceeded the available output context | 1 | Abandoned the oversized read and split the remaining audit into bounded subsystem reads |
| 2026-07-17 | The expected `src/components/planner/PlanSync.tsx` path did not exist | 1 | Found the actual component at `src/components/PlanSync.tsx` with a bounded file search |
| 2026-07-17 | A findings patch failed because copied PowerShell output contained mojibake while the file remained valid UTF-8 | 1 | Re-anchored the patch on ASCII section headings and applied the update without changing file encoding |
| 2026-07-17 | Two follow-up patches looked for a task-plan error row inside `findings.md` | 2 | Corrected the patch targets and kept the intended research update unchanged |
| 2026-07-17 | Agent Reach v1.5.0 could not complete its optional update check after three network retries | 1 | Kept the installed version; the completed source research was unaffected |
| 2026-07-17 | The first specification assertion looked for `Catalog course` as one literal substring even though Markdown wrapped it across lines | 1 | Used a whitespace-tolerant pattern and completed the full specification check successfully |
