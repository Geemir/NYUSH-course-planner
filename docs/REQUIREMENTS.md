# Bulletin requirement pipeline

NYU Shanghai Bulletin pages are the authoritative requirement display. The
Progress page renders their headings, prose, rows, credits, links, and
footnotes in source order. Automated progress is a separate, explicitly beta
interpretation and never replaces the official table.

## Deterministic interpretation

The parser assigns stable IDs to tables even when the source omits DOM IDs. It
preserves structural rows instead of turning headings such as “Select one of
the following” into student actions. The compiler recognizes exact linked
courses, bounded `select/choose N` pools, credit pools, named concentration
tables, named per-attribute tables, narrow waivers, and positively classified
advisor/placement/petition conditions.

Rows that cannot be proven executable remain `unavailable`. They do not create
manual checkboxes and they suppress an authoritative degree percentage. A
`manualConfirmation` is allowed only for a real non-course condition; generic
headings, totals, elective prose, and selector text are never manual evidence.

Sample study plans are source-adjacent advisory data. Eligible eight-term plans
can be previewed before one atomic, undoable import. Unresolved rows become
planning slots and count only as tentative workload until the student chooses
a catalog course.

## Candidate and certification workflow

These commands are intentionally separate:

```powershell
npm.cmd run catalog:generate-nyush-candidate -- --output=artifacts/nyu-shanghai-candidate.json
npm.cmd run catalog:certify-nyush -- --candidate=artifacts/nyu-shanghai-candidate.json --output=artifacts/nyush-certification-report.json
npm.cmd run catalog:publish-certified-nyush -- --report=artifacts/nyush-certification-report.json
```

Generation reads the live Bulletin and writes only the requested ignored local
artifact. It never reads or writes Neon and never overwrites the checked-in
fallback. The source gate rejects structural misses, course-count drops, and
any unresolved SHU reference not listed in
`src/data/nyush-reviewed-unresolved-references.json`.

Certification compares all 43 programs against the reviewed static manifest
in `src/data/nyush-program-golden.json`: table headings, category names,
selector cardinalities, allowed manual conditions, unavailable groups, and
sample-plan term counts. An unavailable group may be certified because the
official display remains complete; it is never treated as calculated progress.

The publisher defaults to a read-only Neon dry run. It records the active
release ID in the report and prints the exact source membership and resulting
release ID. Apply is accepted only after a successful dry run:

```powershell
npm.cmd run catalog:publish-certified-nyush -- --apply --report=artifacts/nyush-certification-report.json
```

Apply rechecks the report hash, source validation, all 43 results, enabled
source membership, and active release pointer. The Shanghai snapshot is staged
immutably; the composed release pointer is activated transactionally, so the
application continues serving the previous complete release if composition
fails.

## Fallback and corrections

After certification, update the last-known-good local fallback explicitly:

```powershell
npm.cmd run catalog:generate-fallback -- --candidate=artifacts/nyu-shanghai-candidate.json
npm.cmd run catalog:certify-nyush -- --candidate=src/data/catalog-fallback.json
```

Do not hand-edit generated snapshot rows. Corrections use audited overlays or
the report → review → apply workflow; snapshots and prior releases remain
immutable and available for rollback.
