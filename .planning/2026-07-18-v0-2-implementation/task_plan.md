# Task Plan: NYUSH Course Planner v0.2 Implementation

## Goal

Implement and verify the six approved v0.2 plans in dependency order using
single-agent inline execution and test-driven development, without deploying or
publishing to production.

## Current Phase

Phase 7

## Phases

### Phase 0: Execution baseline
- [x] Confirm the dedicated feature branch and current workspace state
- [x] Install workspace dependencies
- [x] Run the full baseline suite
- **Status:** completed

### Phase 1: Multi-source Bulletin catalog ingestion
- [x] Complete all tasks in `2026-07-17-v0-2-multi-source-catalog-ingestion.md`
- [x] Pass focused, migration, full-suite, lint, typecheck, and build gates
- **Status:** completed

### Phase 2: Query-driven catalog discovery
- [x] Complete all tasks in `2026-07-17-v0-2-query-catalog-discovery.md`
- [x] Pass server, client, offline, accessibility, and build gates
- **Status:** completed

### Phase 3: Program Profile and plan safety
- [x] Complete all tasks in `2026-07-17-v0-2-program-profile-plan-safety.md`
- [x] Pass migration, conflict, offline, Undo, and build gates
- **Status:** completed

### Phase 4: Correction Hub and reviewed overlays
- [x] Complete all tasks in `2026-07-17-v0-2-correction-hub.md`
- [x] Pass privacy, authorization, audit, overlay, and build gates
- **Status:** completed

### Phase 5: NYU Academic Glass
- [ ] Complete the prototype and automated preference/fallback checks
- [ ] Apply the approved visual direction across the product and pass UI gates
- **Status:** in_progress

### Phase 6: Release integration and GA verification
- [ ] Complete browser, source, migration, security, performance, and rollback rehearsals
- [ ] Update v0.2 documentation and pass every final gate
- **Status:** pending

### Phase 7: Rebaseline deployed Neon + Vercel architecture
- [x] Inspect current `main`, deployment/runtime configuration, database access, and post-v0.2 commits
- [ ] Reconcile the active goal and release evidence with the deployed architecture and new user requirements
- **Status:** in_progress

## Decisions

| Decision | Rationale |
|----------|-----------|
| Execute in the current feature branch | The user explicitly requested inline, single-agent execution and the branch is already dedicated to this project work |
| Do not create or dispatch subagents | The user explicitly requested inline execution instead of multi-agent work |
| Preserve the six-plan dependency order | Stable source identities and query contracts are prerequisites for plan migration, corrections, and UI integration |
| Use strict red-green-refactor | The approved plans and TDD skill require observed failing tests before production behavior |
| Do not deploy or publish production data | The implementation scope ends at verified release readiness unless the user separately authorizes deployment |
| Treat current `main` and deployed Neon/Vercel state as authoritative | The repository advanced to v0.3.2 after the original v0.2 plan, and the user reports that production now runs on Neon + Vercel |

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| Full baseline suite exceeded the first 60-second command window | 1 | Re-ran it as a monitored long-running command; 39 files and 344 tests passed in 65.52 seconds |
