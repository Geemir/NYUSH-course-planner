# Task Plan: NYUSH Course Planner Codebase Exploration

## Goal
Build an evidence-backed understanding of the project's purpose, architecture, data flow, key features, persistence model, and current maturity, then explain it clearly to the user.

## Current Phase
Phase 4

## Phases

### Phase 1: Repository inventory
- [x] Map top-level files, scripts, dependencies, and application routes
- [x] Identify generated/vendor content to exclude
- **Status:** complete

### Phase 2: Architecture and domain model
- [x] Trace authentication, data model, APIs, state stores, hooks, and shared components
- [x] Document the course-planning domain concepts and invariants
- **Status:** complete

### Phase 3: User journeys and runtime behavior
- [x] Trace main planner, sign-in, and admin workflows end-to-end
- [x] Inspect styling and interaction patterns
- **Status:** complete

### Phase 4: Verification and synthesis
- [x] Run safe read-only/static verification where useful
- [x] Summarize strengths, limitations, risks, and suggested reading order
- **Status:** complete

## Key Questions
1. What problem does the tool solve, and for whom?
2. How do course catalog data, requirements, plans, and authentication interact?
3. Which features are fully implemented versus scaffolding or demo behavior?
4. What are the main technical risks and extension points?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Treat all existing changes as user-owned | The worktree was already dirty before exploration |
| Keep exploration read-only except isolated planning notes | User asked to understand the codebase, not change it |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `rg src/**/*.test.ts` is invalid as a literal Windows path | 1 | Use `rg ... src -g '*.test.ts'` instead |
| PowerShell execution policy blocks `npm.ps1` | 1 | Invoke `npm.cmd` directly on Windows |
| Sandboxed build cannot fetch Google-hosted Geist fonts | 1 | Re-run production build with network approval; also run local TypeScript check |
| PowerShell command for URL/path search had a quoting error | 1 | Simplify regex quoting and split the search from environment-name inspection |
| Build-time local PGlite emits cross-realm URL/WASM errors on Node 24 | 1 | Confirmed by A/B build: setting a temporary `DATABASE_URL` removes all errors; no code change made |
