# Findings: NYUSH Course Planner v0.2 Implementation

## Starting state

- Branch: `codex/bulletin-academic-workspace`.
- The workspace is a normal checkout rather than a linked worktree; the user
  explicitly requested inline execution and no further approval checkpoints.
- Dependencies were already current after `npm install`.
- Baseline: 39 Vitest files and 344 tests pass with one worker.
- The six approved implementation documents are committed at `af3d64e` and are
  the execution authority for this phase.

## Active implementation findings

- `CatalogProgramSchema` is a plain Zod object used directly by bootstrap and
  repository readers. Authority defaults must therefore remain backward
  compatible with existing JSON and test casts; normalization can emit explicit
  roles while the schema supplies safe defaults for v0.1 rows.
- Shanghai program construction is centralized in `normalizeProgram`, providing
  one place to emit `auditAuthority` and roles derived from `type` without
  changing requirement engines.
- `CatalogProvenance` currently identifies source URL, snapshot, and hash only;
  source identity belongs on the new wrapper rather than being forced into the
  existing engine-facing `Course` object.
- Typecheck failure is caused by the intended parsed-output contract: runtime
  schema defaults accept v0.1 JSON, while newly constructed `CatalogProgram`
  values must emit authority fields explicitly. The correct source fix is to
  update normalization and typed fixtures, not weaken the v0.2 output type.
- Only four test modules construct `CatalogProgram` values directly. Adding the
  explicit NYUSH authority/role metadata to those fixtures keeps the strict
  parsed contract without widening engine-facing types.
- Discovery currently models program/subject lists only and the production
  fetch allowlist permits Shanghai plus sitemap. Source-aware discovery must
  extend both contracts and the fetch allowlist together; otherwise mocked New
  York tests would pass while real synchronization would be blocked.
- Only four fixture modules construct `BulletinDiscovery` directly, so the new
  source metadata can be required and migrated explicitly rather than optional.
