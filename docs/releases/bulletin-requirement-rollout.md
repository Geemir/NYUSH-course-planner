# Bulletin requirement rollout runbook

1. Deploy the backward-compatible application build before changing catalog
   data. Confirm the existing `/api/catalog/bootstrap` release remains healthy.
2. Generate and certify a fresh local candidate using the commands in
   `docs/REQUIREMENTS.md`. Require `43/43` and inspect Admin → Bulletin
   certification, especially Data Science, Computer Science, Core IPC, and one
   minor.
3. Run the publisher without `--apply`. Record `current`, `candidate`, `result`,
   and the complete membership map. New York snapshot IDs must be unchanged.
4. Regenerate and re-certify the checked-in fallback, then run unit tests,
   lint, build, focused browser tests, and mobile accessibility checks.
5. Apply only the exact dry-run report. The command aborts if the active release
   changed, the report/candidate hash differs, source validation fails, or an
   enabled source is absent.
6. Smoke-test production: Data Science probability choices and concentrations,
   Core IPC official table, Computer Science sample-plan preview/apply/undo,
   conflict preservation, JSON/Excel/PDF exports, and a phone viewport.

## Rollback

Catalog snapshots are immutable. If any production assertion fails, repoint the
active release to the previous release ID printed by the apply command using the
existing release rollback procedure in `docs/releases/v0.2-rollback.md`. Do not
edit or delete the failed snapshot; retain it for diagnostics and audit history.
