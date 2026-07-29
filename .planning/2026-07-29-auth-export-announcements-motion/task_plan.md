# Task Plan: Authentication, Export, Announcements, and Motion

## Goal

Design, approve, implement, and verify four coordinated product improvements: Google-only sign-in, Excel/PDF plan export, dismissible admin announcements, and purposeful inspiration-strip motion.

## Current Phase

Phase 1

## Phases

### Phase 0: Discovery and requirements
- [x] Inspect current authentication, plan export, admin, database, and inspiration-strip boundaries
- [x] Research the relevant Anime.js React, WAAPI, cleanup, and accessibility APIs
- [x] Ask one consolidated set of product questions
- **Status:** complete

### Phase 1: Design and plan confirmation
- [x] Present recommended architecture and alternatives
- [x] Write the design specification and detailed TDD implementation plan
- [ ] Obtain the user's single plan-confirmation approval
- **Status:** in_progress

### Phase 2: Inline implementation
- [ ] Implement the approved tasks without further approval checkpoints
- [ ] Preserve unrelated local changes and avoid unrequested production mutations
- **Status:** pending

### Phase 3: Verification and handoff
- [ ] Run focused tests, full tests, lint, typecheck, build, and browser/artifact QA
- [ ] Report deployment/database steps without pushing or deploying unless explicitly included in the approved plan
- **Status:** pending

## Decisions

| Decision | Rationale |
|---|---|
| Use a dedicated planning directory without switching the legacy active-plan pointer during discovery | The existing v0.2 planning files contain ongoing user-owned work |
| Use only two user checkpoints | The user explicitly requested one consolidated question gate and one plan-confirmation gate |
| Execute inline without subagents | The established project preference is single-agent execution |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| Jina Reader request failed in the restricted sandbox | 1 | Retried the same read-only request with approved network escalation |
| Repository inspection referenced a non-existent `src/app/api/admin/rules/route.test.ts` and `src/engine` path | 1 | Used the existing admin correction route tests and the actual `src/lib` engine modules instead; no product change was made |
