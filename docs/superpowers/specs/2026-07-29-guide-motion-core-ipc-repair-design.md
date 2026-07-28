# Guide Motion and Core IPC Repair Design

Date: 2026-07-29

## Scope

This change has two bounded outcomes:

1. Give the existing four-step first-visit Guide purposeful JavaScript-driven motion.
2. Repair the stale Core Curriculum IPC requirement stored in the active Neon catalog without rewriting unrelated programs, courses, release membership, or provenance.

The English interface, NYU color system, existing Guide content, active New York study-away catalog, and correction-request workflow remain unchanged.

## Verified production state

The production endpoint `https://nyush-course-planner.vercel.app/api/catalog/bootstrap` currently returns:

- release `release-f3d978de7589dbaf31f28153`;
- Shanghai member snapshot `recovery-fallback`;
- 43 programs;
- Core `course-list-per-attribute` as `all` with 62 children;
- the next four Core course-list categories as `all` with 3, 22, 42, and 11 children.

The checked-in fallback at commit `1e0f7ea` instead defines those categories as `choose 2`, then `choose 1` four times. The production bug is therefore stale catalog data, not a Progress-page rendering calculation. Deploying code alone cannot migrate JSON already stored in Neon.

The existing uncommitted `scripts/update-nyush-programs.ts` is not the repair mechanism for this change. It rewrites every matching program and copies fallback provenance into the `recovery-fallback` row, which broadens the write and can introduce snapshot/provenance inconsistency.

## Guide motion design

### Behavior

The existing Base UI dialog entrance remains responsible for opening and closing the modal. JavaScript motion is limited to meaningful Guide state changes:

- On first display, the step icon and copy settle into place as one short entrance.
- Next moves the current step out to the left and the new step in from the right.
- Back reverses that spatial direction.
- The active progress indicator changes with the same state transition.
- Skip, Done, keyboard navigation, focus trapping, and focus restoration remain immediate and unchanged.

The motion budget is 240 ms with an ease-out-quint curve. It animates only `transform` and `opacity`, does not block interaction, and introduces no animation-library dependency.

### Implementation boundary

`OnboardingDialog` will use the browser Web Animations API through a focused helper. The helper receives the animated element, navigation direction, and reduced-motion preference. The component retains visible content as its default state so unsupported animation APIs, hidden tabs, or interrupted animations cannot leave the Guide blank.

When `prefers-reduced-motion: reduce` is active, step content changes immediately with no directional movement. The existing CSS reduced-motion treatment for the modal remains in place.

### Tests

Component tests will establish these behaviors before production code changes:

- Next requests a forward step animation.
- Back requests a reverse step animation.
- reduced-motion users receive no Web Animation request.
- the four-step flow, Skip, Done, and focus restoration continue to pass.

## Core IPC repair design

### Repair command

A dedicated operator command will target only the active Shanghai snapshot's `core` program. It will default to dry-run and require an explicit `--apply` flag for a write.

The command will:

1. Read the active release and its `nyu-shanghai` snapshot ID.
2. Read exactly one `catalogProgram` row: `(snapshotId, programId = core)`.
3. Validate the row with `CatalogProgramSchema`.
4. Compare the five expected category IDs and their child counts with the checked-in fallback.
5. Build a candidate by replacing only those five requirement subtrees.
6. Preserve every other Core field, including its existing provenance.
7. Print a concise before/after report in dry-run mode and exit without writing.
8. In apply mode, perform one compare-and-swap update guarded by snapshot ID, program ID, and the exact previously read JSON value.
9. Read the row back and require `choose 2/1/1/1/1` with child counts `62/3/22/42/11` before reporting success.

The command will not update the other 42 programs, catalog courses, snapshots, releases, release membership, overlays, users, or plans.

### Failure handling

The repair fails closed when:

- no active release or Shanghai snapshot exists;
- the Core row is absent or schema-invalid;
- any target category is missing, duplicated, or has an unexpected child set/count;
- the active release changes during the operation;
- the compare-and-swap update affects no row and readback does not already match the target;
- post-write verification differs from the target.

Transient reads use the existing bounded retry helper. A possibly ambiguous write is safe to retry only through the compare-and-swap guard followed by readback: either the old value is replaced once, or the already-correct value is recognized.

### Tests

Pure repair-planning logic will be test-driven independently of Neon:

- stale Core data produces a candidate changing only five requirements;
- already-correct data produces a no-op;
- unexpected category shape fails closed;
- unrelated Core fields and provenance are byte-for-byte equivalent in the candidate;
- verification rejects incorrect kinds, counts, or child counts.

Repository-level tests will cover the guarded update against the project's disposable test database if the existing harness supports the same JSON equality semantics.

## Operational sequence

1. Implement and verify locally.
2. Run the new command in dry-run mode against Neon and record the release/snapshot and before/after summary.
3. Obtain separate authorization for the production write.
4. Run once with `--apply` against the same expected release.
5. Read the public production bootstrap endpoint and verify `choose 2/1/1/1/1`.
6. Deploy the Guide animation separately after local build and browser verification.

No production database write or Vercel deployment is authorized by this design approval alone.

## Success criteria

- Guide step changes feel directional and responsive while remaining accessible to reduced-motion users.
- Production Core IPC displays 62 eligible courses but requires only two selections.
- The four subsequent Core pools each require one selection.
- New York study-away data and all unrelated catalog/program data remain unchanged.
- The repair is dry-run by default, narrowly guarded, independently verifiable, and safe to re-run.
