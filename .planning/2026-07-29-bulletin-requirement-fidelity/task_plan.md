# Bulletin Requirement Fidelity Design

## Goal

Create and review a design specification for a Bulletin-first requirement display and a strictly validated degree-progress interpretation pipeline. Do not implement product code in this phase.

## Phases

- [x] Phase 1: Inspect the current parser, normalizer, validator, progress UI, release workflow, and representative production data.
- [x] Phase 2: Identify the root causes and quantify the affected catalog surface.
- [x] Phase 3: Compare solution approaches and obtain approval for the recommended Bulletin-first hybrid design.
- [x] Phase 4: Write the approved design specification.
- [x] Phase 5: Self-review the specification for placeholders, contradictions, ambiguity, and scope.
- [x] Phase 6: Research and incorporate source-faithful sample-plan display and safe template import behavior.
- [x] Phase 7: Obtain user review of the amended written specification.
- [x] Phase 8: Write and self-review the implementation plan.
- [ ] Phase 9: Choose an execution mode and begin implementation in a later turn.

## Decisions

- The default Progress presentation reproduces the Bulletin requirement tables.
- Only verified executable requirements participate in automatic progress calculations.
- Structural headings and selection directives are never student-confirmable requirements.
- Unknown or unsupported structures become unavailable interpretations and block catalog publication; they do not fall back to `manualConfirmation`.
- The existing active release remains live until a complete replacement Shanghai snapshot passes the new gates.
- Sample plans are advisory source blocks, separate from executable degree requirements.
- Sample-plan import requires preview, preserves conflicting existing placements by default, creates real planning slots for non-course placeholders, and applies as one undoable transaction.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| Planned inspection referenced nonexistent `src/lib/catalogResponse.ts` | 1 | Use `rg --files src/lib/catalog src/lib` to locate the actual catalog contract and response modules before drafting file-specific tasks. |
| Planned inspection referenced nonexistent `src/lib/bulletin/syncCli.ts` | 1 | Confirmed CLI exports live in `scripts/sync-bulletin.ts`; replaced the unsafe sync-based candidate command with a read-only local-output extension to `scripts/regenerate-nyush-fallback.ts`. |
