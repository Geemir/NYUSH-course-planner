# Bulletin Requirement Fidelity and Sample Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Degree Progress default to source-faithful NYU Shanghai Bulletin requirements, calculate only verified interpretations, and safely preview/import Bulletin sample study plans without overwriting student work.

**Architecture:** Preserve Bulletin structure in a versioned display model, compile it through a separate fail-closed requirement interpreter, and expose both through the existing catalog release. Interactive sample-plan import remains client-side: a pure preview builder resolves active-release courses, and one atomic Zustand mutation applies exact courses plus first-class planning slots. Production keeps its current release until a complete Shanghai candidate passes deterministic certification and is atomically activated.

**Tech Stack:** Next.js 16.2.9 App Router, React 19, TypeScript, Zod 4, Cheerio, Zustand, Drizzle/PostgreSQL (Neon), Vitest/Testing Library, Playwright, ExcelJS, jsPDF.

## Global Constraints

- Keep the product an NYUSH degree planner; New York records remain study-away course discovery data and are not interpreted as NYUSH degree programs.
- Treat Bulletin text as trusted source content and all parser output as untrusted until deterministic validation succeeds.
- Never convert unknown structure, headings, or `Select`/`Choose`/`Complete one of` directives into `manualConfirmation`.
- Default Progress to source-faithful Bulletin tables; calculate only verified interpretations.
- Keep official Bulletin content in English and route new UI labels through the existing typed locale dictionary.
- Preserve desktop and mobile meaning, 44px touch targets where practical, keyboard operation, semantic tables/headings, visible focus, and reduced-motion behavior.
- Keep Plan wire version 2; add `planningSlots` with a default empty array so old local/cloud/JSON plans remain valid.
- Do not patch individual active Neon program rows. Generate, certify, compose, then atomically activate one immutable Shanghai snapshot while retaining the prior release.
- Read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, `15-route-handlers.md`, `02-guides/testing/vitest.md`, and `03-architecture/accessibility.md` before changing Next.js boundaries.
- Use TDD for every behavior change and commit each task independently without staging unrelated user files.

---

## File Structure

- `src/lib/bulletin/displayTypes.ts`: source-faithful requirement/sample-plan schemas with no planner-state dependency.
- `src/lib/bulletin/parseProgramPage.ts`: DOM-order extraction and nearest-heading association only.
- `src/lib/bulletin/compileRequirements.ts`: directive grammar, group boundaries, AST compilation, and diagnostics.
- `src/lib/bulletin/normalize.ts`: orchestration from parsed documents into catalog programs; no fallback interpretation logic.
- `src/lib/bulletin/certifyPrograms.ts`: deterministic per-program certification and golden comparison.
- `src/lib/types.ts`: catalog interpretation metadata plus backward-compatible Plan v2 planning slots.
- `src/lib/samplePlan.ts`: pure preview classification, course resolution, term mapping, and selected change set.
- `src/store/plannerStore.ts`: one atomic sample-plan apply and slot replacement mutation.
- `src/components/progress/BulletinRequirements.tsx`: accessible source-faithful requirement rendering.
- `src/components/progress/SampleStudyPlan.tsx`: source sample-plan rendering and import entry point.
- `src/components/progress/SamplePlanPreviewDialog.tsx`: responsive preview/conflict selection.
- `src/components/planner/PlanningSlotCard.tsx`: placeholder display, edit/remove, and course-choice action.
- `scripts/certify-nyush-programs.ts`: machine-readable certification report and nonzero failure exit.
- `scripts/publish-certified-nyush.ts`: dry-run-first candidate composition and atomic activation.
- `src/data/nyush-program-golden.json`: hand-reviewed expectations for every current Shanghai program.

---

### Task 1: Define Source Display, Interpretation, and Plan Slot Contracts

**Files:**
- Create: `src/lib/bulletin/displayTypes.ts`
- Create: `src/lib/bulletin/displayTypes.test.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/catalog/types.test.ts`
- Modify: `src/lib/planIO.ts`
- Modify: `src/lib/planIO.test.ts`

**Interfaces:**
- Produces: `BulletinRequirementDocumentSchema`, `BulletinDisplayRowSchema`, `BulletinSamplePlanSchema`, `CatalogRequirementInterpretationSchema`, `PlanningSlotSchema`.
- Compatibility: old `CatalogProgram` values may omit `bulletinDisplay`, `interpretations`, and `samplePlan`; old Plan v2 values may omit `planningSlots`.

- [ ] **Step 1: Write failing schema tests**

```ts
it("preserves display rows and a display-only sample plan", () => {
  expect(BulletinRequirementDocumentSchema.parse(displayFixture).sections[0].blocks[0]).toMatchObject({
    kind: "table",
    headingTrail: [{ level: 3, text: "Finance" }],
    rows: [{ role: "directive" }, { role: "course" }],
  });
  expect(BulletinSamplePlanSchema.parse(sampleFixture).importStatus).toBe("display-only");
});

it("defaults legacy plan v2 planning slots to empty", () => {
  expect(PlanSnapshotV2Schema.parse(legacyV2).planningSlots).toEqual([]);
});
```

- [ ] **Step 2: Run the focused tests and confirm contract failures**

Run: `npm.cmd test -- src/lib/bulletin/displayTypes.test.ts src/lib/catalog/types.test.ts src/lib/planIO.test.ts`

Expected: FAIL because the schemas and `planningSlots` do not exist.

- [ ] **Step 3: Implement the source-only schemas**

```ts
export const BulletinDiagnosticSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  tableId: z.string().min(1).optional(),
  sourceIndex: z.number().int().nonnegative().optional(),
}).strict();

export const BulletinDisplayRowSchema = z.object({
  sourceIndex: z.number().int().nonnegative(),
  role: z.enum(["heading", "directive", "course", "note", "total"]),
  text: z.string().min(1),
  creditsText: z.string().min(1).nullable(),
  linkedCourseCodes: z.array(z.string().min(1)),
  sourceAnchors: z.array(z.string().min(1)),
  footnoteMarkers: z.array(z.string().min(1)),
}).strict();

export const BulletinTableBlockSchema = z.object({
  kind: z.literal("table"),
  id: z.string().min(1),
  caption: z.string().min(1).nullable(),
  headingTrail: z.array(z.object({
    level: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
    text: z.string().min(1),
  }).strict()),
  rows: z.array(BulletinDisplayRowSchema),
}).strict();

export const BulletinHeadingBlockSchema = z.object({
  kind: z.literal("heading"),
  level: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  text: z.string().min(1),
}).strict();

export const BulletinProseBlockSchema = z.object({
  kind: z.literal("prose"),
  paragraphs: z.array(z.string().min(1)).min(1),
}).strict();

export const BulletinRequirementDocumentSchema = z.object({
  schemaVersion: z.literal(2),
  sourceUrl: z.string().url(),
  sections: z.array(z.object({
    id: z.string().min(1),
    heading: z.string(),
    blocks: z.array(z.discriminatedUnion("kind", [
      BulletinHeadingBlockSchema,
      BulletinProseBlockSchema,
      BulletinTableBlockSchema,
    ])),
  }).strict()),
}).strict();

export const BulletinSamplePlanSchema = z.object({
  sectionId: z.string().min(1),
  heading: z.string().min(1),
  terms: z.array(BulletinSamplePlanTermSchema).min(1),
  totalCreditsText: z.string().min(1).nullable(),
  importStatus: z.enum(["eligible", "display-only"]),
  diagnostics: z.array(BulletinDiagnosticSchema),
}).strict();
```

Define heading/prose/table block schemas and infer all exported TypeScript types from Zod.

- [ ] **Step 4: Add interpretation and planning-slot schemas to `types.ts`**

```ts
export const CatalogRequirementInterpretationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["verified", "unavailable"]),
  requirement: RequirementNodeSchema.nullable(),
  sourceTableIds: z.array(z.string().min(1)).min(1),
  sourceRowRefs: z.array(z.object({
    tableId: z.string().min(1),
    sourceIndex: z.number().int().nonnegative(),
  }).strict()),
  diagnostics: z.array(BulletinDiagnosticSchema),
}).strict().superRefine((value, context) => {
  if ((value.status === "verified") !== (value.requirement !== null)) {
    context.addIssue({ code: "custom", message: "Verified interpretations require an AST; unavailable interpretations forbid one." });
  }
});

export const PlanningSlotSchema = z.object({
  id: z.string().min(1),
  sourceKey: z.string().min(1),
  semesterId: SemesterIdSchema,
  label: z.string().min(1).max(200),
  credits: z.number().nonnegative().nullable(),
  source: z.object({
    kind: z.literal("bulletin-sample-plan"),
    programId: z.string().min(1),
    catalogReleaseId: z.string().min(1),
    sectionId: z.string().min(1),
    termSourceIndex: z.number().int().nonnegative(),
    rowSourceIndex: z.number().int().nonnegative(),
  }).strict(),
}).strict();
```

Add optional/defaulted `bulletinDisplay`, `interpretations`, and `samplePlan` to `CatalogProgramInputSchema`. Transform omitted legacy interpretations from existing categories as verified. Add `planningSlots?: PlanningSlot[]` to `PlanSnapshotV2` and default it to `[]` in `PlanSnapshotV2Schema`.

- [ ] **Step 5: Run contract tests**

Run: `npm.cmd test -- src/lib/bulletin/displayTypes.test.ts src/lib/catalog/types.test.ts src/lib/planIO.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the contracts**

```powershell
git add src/lib/bulletin/displayTypes.ts src/lib/bulletin/displayTypes.test.ts src/lib/types.ts src/lib/catalog/types.test.ts src/lib/planIO.ts src/lib/planIO.test.ts
git commit -m "feat: define Bulletin display and planning slot contracts"
```

### Task 2: Parse Source-Faithful Requirement and Sample-Plan Blocks

**Files:**
- Modify: `src/lib/bulletin/parseProgramPage.ts`
- Modify: `src/lib/bulletin/parseProgramPage.test.ts`
- Modify: `src/lib/bulletin/__fixtures__/program-page.html`
- Create: `src/lib/bulletin/__fixtures__/computer-science-sample-plan.html`

**Interfaces:**
- Consumes: source schemas from Task 1.
- Produces: `BulletinProgramDocument.bulletinDisplay` and enhanced `samplePlan` in DOM order.

- [ ] **Step 1: Add failing parser assertions for nearest headings and row roles**

```ts
it("preserves nearest concentration headings instead of the section's first heading", () => {
  const table = document.bulletinDisplay.sections
    .flatMap((section) => section.blocks)
    .find((block) => block.kind === "table" && block.id === "finance-table");
  expect(table).toMatchObject({ headingTrail: expect.arrayContaining([{ level: 3, text: "Finance" }]) });
});

it("classifies sample-plan courses and placeholders without guessing", () => {
  const terms = parseProgramPage(html, source).samplePlan!.terms;
  expect(terms).toHaveLength(8);
  expect(terms[0].rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "course", linkedCourseCodes: ["MATH-SHU 131"] }),
    expect.objectContaining({ kind: "placeholder", label: "Chinese or EAP" }),
  ]));
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm.cmd test -- src/lib/bulletin/parseProgramPage.test.ts`

Expected: FAIL because tables lack heading trails and sample rows lack the new kinds.

- [ ] **Step 3: Implement nearest-heading and ordered block extraction**

Replace `tableSection()` heading selection with a helper that walks preceding DOM siblings and ancestors, collecting the nearest applicable `h2`–`h6`. Preserve prose and tables as ordered blocks. Map source roles using explicit text-aware classification:

```ts
function displayRole(row: SourceTableRow): BulletinDisplayRow["role"] {
  if (row.role === "total") return "total";
  if (row.linkedCourseCodes.length > 0) return "course";
  if (/^(?:select|choose|complete)\b/i.test(row.text)) return "directive";
  if (row.role === "areaHeader" || row.role === "areaSubheader") return "heading";
  return "note";
}
```

- [ ] **Step 4: Strengthen sample-plan parsing**

Parse each plan grid into ordered terms, exclude term/overall totals from term course rows, retain their credit text separately, and set:

```ts
const importStatus =
  terms.length === 8 && terms.every((term, index) => term.ordinal === index + 1)
    ? "eligible"
    : "display-only";
```

A row is `course` only when it contains at least one linked canonical code; otherwise preserve it as a `placeholder`.

- [ ] **Step 5: Run parser tests**

Run: `npm.cmd test -- src/lib/bulletin/parseProgramPage.test.ts`

Expected: PASS with eight CS sample terms and preserved heading trails.

- [ ] **Step 6: Commit parser changes**

```powershell
git add src/lib/bulletin/parseProgramPage.ts src/lib/bulletin/parseProgramPage.test.ts src/lib/bulletin/__fixtures__/program-page.html src/lib/bulletin/__fixtures__/computer-science-sample-plan.html
git commit -m "feat: preserve Bulletin requirement and sample-plan structure"
```

### Task 3: Build a Fail-Closed Requirement Compiler

**Files:**
- Create: `src/lib/bulletin/compileRequirements.ts`
- Create: `src/lib/bulletin/compileRequirements.test.ts`
- Modify: `src/lib/bulletin/normalize.ts`
- Modify: `src/lib/bulletin/normalize.test.ts`

**Interfaces:**
- Produces: `compileProgramRequirements(document, courseTitles): CatalogRequirementInterpretation[]`.
- Invariant: only verified interpretations become `CatalogProgram.categories`; unavailable groups retain display rows and diagnostics.

- [ ] **Step 1: Write failing semantic tests**

```ts
it("compiles Select one and keeps its credit cell out of the cardinality", () => {
  expect(compile(rows("Select one of the following:", "4", ["MATH-SHU 235", "MATH-SHU 238"]))).toMatchObject({
    status: "verified",
    requirement: { kind: "choose", count: 1, children: [{ kind: "course" }, { kind: "course" }] },
  });
});

it("does not compile a structural heading as manual confirmation", () => {
  expect(compile(rows("Foundational Courses", null, []))).toMatchObject({
    status: "unavailable",
    requirement: null,
  });
});

it("binds Complete one concentration to named tables", () => {
  const result = compileProgramRequirements(dataScienceDocument, titles);
  expect(result.find((item) => item.name === "Concentrations")?.requirement).toMatchObject({
    kind: "choose",
    count: 1,
    children: expect.arrayContaining([expect.objectContaining({ kind: "all" })]),
  });
});
```

- [ ] **Step 2: Run and confirm the current fallback behavior fails**

Run: `npm.cmd test -- src/lib/bulletin/compileRequirements.test.ts src/lib/bulletin/normalize.test.ts`

Expected: FAIL; headings/selectors currently fall through to manual confirmation and concentration tables are disconnected.

- [ ] **Step 3: Implement the directive grammar and group boundaries**

```ts
const COUNT_WORDS = new Map([
  ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5],
  ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10],
]);

const CHOOSE_DIRECTIVE = /^(?:select|choose)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i;
const CONCENTRATION_DIRECTIVE = /^complete\s+one\s+of\s+the\s+following\s+concentrations?:?/i;

function directiveCount(text: string): number | null {
  if (CONCENTRATION_DIRECTIVE.test(text)) return 1;
  const token = text.match(CHOOSE_DIRECTIVE)?.[1]?.toLowerCase();
  if (!token) return null;
  return COUNT_WORDS.get(token) ?? Number(token);
}
```

Implement boundaries at same/higher headings, next directive, applicable total, or table-group end. Compile only pure course references, supported attributes/exclusions/waivers, and positively classified manual conditions (`advisor approval`, `placement`, `proficiency`, `petition`). Return diagnostic codes for every unavailable construction.

- [ ] **Step 4: Remove manual fallback from normalization**

Delete `explicitRowNode()`'s generic `manualConfirmation` return and `manualRowNode()`. Make `normalizeProgram()` consume compiler results, publish verified interpretations as categories, retain all interpretations/display content, and derive category names from nearest meaningful headings rather than `Course List`.

- [ ] **Step 5: Run compiler and normalizer tests**

Run: `npm.cmd test -- src/lib/bulletin/compileRequirements.test.ts src/lib/bulletin/normalize.test.ts`

Expected: PASS, including Data Science probability, concentration, and structural-heading assertions.

- [ ] **Step 6: Commit the compiler**

```powershell
git add src/lib/bulletin/compileRequirements.ts src/lib/bulletin/compileRequirements.test.ts src/lib/bulletin/normalize.ts src/lib/bulletin/normalize.test.ts
git commit -m "fix: compile Bulletin requirements without manual fallbacks"
```

### Task 4: Turn Requirement Fidelity into a Publication Gate

**Files:**
- Modify: `src/lib/bulletin/validateSnapshot.ts`
- Modify: `src/lib/bulletin/validateSnapshot.test.ts`
- Create: `src/lib/bulletin/certifyPrograms.ts`
- Create: `src/lib/bulletin/certifyPrograms.test.ts`

**Interfaces:**
- Produces: `certifyShanghaiPrograms(programs, golden): ProgramCertificationReport`.
- Publication: `assertPublishable()` rejects any Shanghai candidate with unavailable requirement interpretations or display fidelity errors.

- [ ] **Step 1: Add failing validation tests for every new gate**

```ts
expect(validate(candidateWithSelectorManual).errors).toContainEqual(expect.objectContaining({ code: "selector-manual-confirmation" }));
expect(validate(candidateWithGenericCategory).errors).toContainEqual(expect.objectContaining({ code: "generic-category-name" }));
expect(validate(candidateWithMissingDisplayRow).errors).toContainEqual(expect.objectContaining({ code: "display-row-fidelity" }));
expect(validate(candidateWithBrokenSamplePlan).errors).toContainEqual(expect.objectContaining({ code: "sample-plan-fidelity" }));
```

- [ ] **Step 2: Run and confirm validation currently permits the candidates**

Run: `npm.cmd test -- src/lib/bulletin/validateSnapshot.test.ts src/lib/bulletin/certifyPrograms.test.ts`

Expected: FAIL because the diagnostic codes and certification module do not exist.

- [ ] **Step 3: Implement hard validation invariants**

Add codes for selector/manual misuse, invalid choose cardinality, generic final names, duplicate/missing source references, unavailable interpretations, credit mismatch, display fidelity, sample-plan fidelity, and unexpected manual sets. Validate `choose.count <= children.length`, exact governed-row coverage, source order, heading trails, and non-null AST iff verified.

Delete the validator's duplicate `semanticRowPaths()` interpretation mirror. Coverage must compare compiler-emitted source references with `bulletinDisplay`; the validator must not reimplement compiler grouping rules and reproduce the same bug independently.

- [ ] **Step 4: Implement deterministic certification output**

```ts
export interface ProgramCertificationResult {
  programId: string;
  status: "pass" | "fail";
  tableHeadings: string[];
  categoryNames: string[];
  selectors: Array<{ label: string; count: number; childCount: number }>;
  manualConditions: string[];
  unavailableGroups: string[];
  samplePlan: { termCount: number; placeholders: number; unresolvedCourses: string[] } | null;
  errors: string[];
}
```

Sort every array and report deterministically so two identical candidates produce byte-identical JSON.

- [ ] **Step 5: Run validation tests**

Run: `npm.cmd test -- src/lib/bulletin/validateSnapshot.test.ts src/lib/bulletin/certifyPrograms.test.ts`

Expected: PASS; `assertPublishable()` throws for all corrupt fixtures.

- [ ] **Step 6: Commit publication gates**

```powershell
git add src/lib/bulletin/validateSnapshot.ts src/lib/bulletin/validateSnapshot.test.ts src/lib/bulletin/certifyPrograms.ts src/lib/bulletin/certifyPrograms.test.ts
git commit -m "feat: block unverified Shanghai requirement releases"
```

### Task 5: Preserve New Catalog Fields through Persistence, API, Fallback, and Overlays

**Files:**
- Modify: `src/lib/catalogRepository.ts`
- Modify: `src/lib/catalogRepository.test.ts`
- Modify: `src/lib/catalog/contracts.ts`
- Modify: `src/lib/catalog/contracts.test.ts`
- Modify: `src/lib/catalog/searchRepository.ts`
- Modify: `src/lib/catalog/searchRepository.test.ts`
- Create: `src/app/api/catalog/courses/resolve/route.ts`
- Create: `src/app/api/catalog/courses/resolve/route.test.ts`
- Modify: `src/lib/catalogClient.ts`
- Modify: `src/lib/catalogClient.test.ts`
- Modify: `src/lib/data.ts`
- Modify: `src/lib/catalogResponse.test.ts`
- Modify: `src/lib/corrections/policy.ts`
- Modify: `src/lib/corrections/policy.test.ts`
- Modify: `src/lib/corrections/overlays.ts`
- Modify: `src/lib/corrections/overlays.test.ts`

**Interfaces:**
- Consumes: extended `CatalogProgramSchema`.
- Produces: identical source display/interpretation/sample-plan data from normalized candidate through Neon JSONB, bootstrap response, client parse, and fallback; `CatalogClient.resolveCourseCodes(codes, signal)` for release-scoped exact resolution.

- [ ] **Step 1: Add a round-trip test with a display table and sample plan**

```ts
const program = richProgram({ bulletinDisplay, interpretations, samplePlan });
await publishCandidate(db, candidate({ programs: [program] }));
await expect(getActiveReleaseCatalog(db)).resolves.toMatchObject({
  programs: [expect.objectContaining({ bulletinDisplay, interpretations, samplePlan })],
});
expect(CatalogBootstrapResponseSchema.parse(bootstrap).programs[0].samplePlan).toEqual(samplePlan);

const resolved = await resolveActiveCourseCodes(db, ["MATH-SHU 131", "CSCI-UA 201"]);
expect(resolved.get("MATH-SHU 131")).toEqual([expect.objectContaining({ sourceId: "nyu-shanghai" })]);
```

- [ ] **Step 2: Run persistence/contract tests and confirm failure**

Run: `npm.cmd test -- src/lib/catalogRepository.test.ts src/lib/catalog/contracts.test.ts src/lib/catalog/searchRepository.test.ts src/app/api/catalog/courses/resolve/route.test.ts src/lib/catalogClient.test.ts src/lib/catalogResponse.test.ts`

Expected: FAIL until the full schema survives every boundary.

- [ ] **Step 3: Update catalog and fallback boundaries**

Parse program JSONB exclusively through the extended `CatalogProgramSchema`; keep bootstrap `GET` uncached/no-store as currently configured because it reads the active release at request time. Ensure fallback generation serializes the same program object without stripping new fields.

- [ ] **Step 4: Add release-scoped exact course-code resolution**

Extend contracts with strict request `{ codes: string[] }` (deduplicated, maximum 100) and response `{ releaseId, matches: Array<{ code, records }> }`. Implement `resolveActiveCourseCodes()` by querying only snapshots in the active release and returning every exact canonical-code match sorted by `sourceId`/`stableId`. Add a dynamic `POST` Route Handler at `/api/catalog/courses/resolve`; it returns `400` for invalid input and `503` when no active release exists, and never caches or mutates data. Add `CatalogClient.resolveCourseCodes()` using the response schema.

- [ ] **Step 5: Make requirement overlays preserve the trust boundary**

When applying a category upsert/delete overlay, rebuild the matching interpretation entry, require a verified non-null AST, retain source display unchanged, and attach reviewed-overlay provenance. Reject patches that create a generic category name, selector-like manual confirmation, invalid choose cardinality, or orphaned row reference.

- [ ] **Step 6: Run all boundary, resolver, and overlay tests**

Run: `npm.cmd test -- src/lib/catalogRepository.test.ts src/lib/catalog/contracts.test.ts src/lib/catalog/searchRepository.test.ts src/app/api/catalog/courses/resolve/route.test.ts src/lib/catalogClient.test.ts src/lib/catalogResponse.test.ts src/lib/corrections/policy.test.ts src/lib/corrections/overlays.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the catalog round trip**

```powershell
git add src/lib/catalogRepository.ts src/lib/catalogRepository.test.ts src/lib/catalog/contracts.ts src/lib/catalog/contracts.test.ts src/lib/catalog/searchRepository.ts src/lib/catalog/searchRepository.test.ts src/app/api/catalog/courses/resolve/route.ts src/app/api/catalog/courses/resolve/route.test.ts src/lib/catalogClient.ts src/lib/catalogClient.test.ts src/lib/data.ts src/lib/catalogResponse.test.ts src/lib/corrections/policy.ts src/lib/corrections/policy.test.ts src/lib/corrections/overlays.ts src/lib/corrections/overlays.test.ts
git commit -m "feat: publish source-faithful program catalogs"
```

### Task 6: Make Progress Explicitly Aware of Verification Coverage

**Files:**
- Modify: `src/lib/progress.ts`
- Create: `src/lib/progress.test.ts`
- Modify: `src/lib/derivePlan.ts`
- Modify: `src/lib/derivePlan.test.ts`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: `ProgramProgress.interpretationStatus`, `verifiedCategoryCount`, `totalInterpretationCount`, and nullable authoritative fractions.

- [ ] **Step 1: Add failing partial-coverage tests**

```ts
expect(progressFor(partialProgram)).toMatchObject({
  interpretationStatus: "partial",
  authoritativePlannedFraction: null,
  verifiedCategoryCount: 1,
  totalInterpretationCount: 2,
});
expect(progressFor(verifiedProgram).authoritativePlannedFraction).toBe(0.5);
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm.cmd test -- src/lib/progress.test.ts src/lib/derivePlan.test.ts`

Expected: FAIL because progress currently always exposes one percentage.

- [ ] **Step 3: Implement verified-only calculation metadata**

Keep `plannedFraction`/`completedFraction` as internal verified-category fractions for compatibility. Add nullable authoritative fractions that are populated only when every interpretation is verified. Compute `automationCoverage = verifiedCategoryCount / totalInterpretationCount` and never evaluate a null AST.

- [ ] **Step 4: Run progress tests**

Run: `npm.cmd test -- src/lib/progress.test.ts src/lib/derivePlan.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit progress trust metadata**

```powershell
git add src/lib/progress.ts src/lib/progress.test.ts src/lib/derivePlan.ts src/lib/derivePlan.test.ts src/lib/types.ts
git commit -m "fix: report only verified degree progress"
```

### Task 7: Add Backward-Compatible Planning Slots and Atomic Store Mutations

**Files:**
- Modify: `src/store/plannerStore.ts`
- Modify: `src/store/plannerStore.test.ts`
- Modify: `src/store/planHistory.ts`
- Modify: `src/lib/planMigration.ts`
- Modify: `src/lib/planMigration.test.ts`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/repository.test.ts`

**Interfaces:**
- Produces: `applySamplePlan(changeSet)`, `replacePlanningSlot(slotId, course)`, `updatePlanningSlot`, `removePlanningSlot`.
- History invariant: one sample-plan apply or slot replacement creates exactly one undo record.

- [ ] **Step 1: Write failing store and persistence tests**

```ts
store().applySamplePlan({ placements: [courseChange], slots: [slot] });
expect(store().placements).toHaveLength(1);
expect(store().planningSlots).toEqual([slot]);
expect(store().undoLabel).toBe("Apply sample study plan");
store().undo();
expect(store().placements).toEqual([]);
expect(store().planningSlots).toEqual([]);
```

Also assert V1 migration produces `planningSlots: []`, cloud round trips preserve slots, and plan reconciliation retains source provenance while updating `catalogReleaseId` only at the plan level.

- [ ] **Step 2: Run and confirm failure**

Run: `npm.cmd test -- src/store/plannerStore.test.ts src/lib/planMigration.test.ts src/lib/repository.test.ts`

Expected: FAIL because store state and snapshots lack slots.

- [ ] **Step 3: Add slots to every present/snapshot boundary**

Include `planningSlots` in `PlannerPresent`, `initialPresent`, `presentFromState`, `plannerPersistedState`, hydration, replacement, import, reset, V1 migration, V2 reconciliation, cloud save/read, and JSON export. Do not add slots to course-reference locking because a slot is not a course.

- [ ] **Step 4: Implement atomic mutations**

```ts
applySamplePlan: (changeSet) => mutate("Apply sample study plan", (present) => ({
  ...present,
  placements: mergePlacements(present.placements, changeSet.placements),
  planningSlots: mergeSlotsBySourceKey(present.planningSlots, changeSet.slots),
})),
replacePlanningSlot: (slotId, course) => mutate("Choose course for planning slot", (present) => ({
  ...present,
  placements: placeWithoutDuplicate(present.placements, course),
  planningSlots: present.planningSlots.filter((slot) => slot.id !== slotId),
})),
```

- [ ] **Step 5: Run store/migration/repository tests**

Run: `npm.cmd test -- src/store/plannerStore.test.ts src/lib/planMigration.test.ts src/lib/repository.test.ts src/lib/planIO.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit slot persistence**

```powershell
git add src/store/plannerStore.ts src/store/plannerStore.test.ts src/store/planHistory.ts src/lib/planMigration.ts src/lib/planMigration.test.ts src/lib/repository.ts src/lib/repository.test.ts src/lib/planIO.ts src/lib/planIO.test.ts
git commit -m "feat: persist undoable sample-plan slots"
```

### Task 8: Build the Pure Sample-Plan Preview and Resolution Engine

**Files:**
- Create: `src/lib/samplePlan.ts`
- Create: `src/lib/samplePlan.test.ts`

**Interfaces:**
- Produces: `buildSamplePlanPreview(input): SamplePlanPreview` and `selectedSamplePlanChanges(preview, selections): SamplePlanChangeSet`.
- Consumes: active catalog release ID, exact-code resolver records, current placements/slots, and one program sample plan.

- [ ] **Step 1: Write the full preview matrix as failing tests**

```ts
expect(statusFor(unplannedExact)).toBe("add");
expect(statusFor(sameTermExact)).toBe("keep");
expect(statusFor(otherTermExact)).toBe("conflict");
expect(statusFor(placeholder)).toBe("placeholder");
expect(statusFor(ambiguousCatalogCode)).toBe("unavailable");
expect(selectedSamplePlanChanges(reappliedPreview, defaults)).toEqual({ placements: [], slots: [] });
```

Assert the conflict default keeps the existing term, explicit move produces one move change, and ordinal mapping is exactly `SEMESTER_IDS[ordinal - 1]`.

- [ ] **Step 2: Run and confirm failure**

Run: `npm.cmd test -- src/lib/samplePlan.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic resolution and stable source keys**

```ts
export function samplePlanSemester(ordinal: number): SemesterId | null {
  return ordinal >= 1 && ordinal <= SEMESTER_IDS.length
    ? SEMESTER_IDS[ordinal - 1]
    : null;
}

export function planningSlotSourceKey(input: SlotSourceIdentity): string {
  return [input.programId, input.sectionId, input.termOrdinal, input.rowSourceIndex, normalize(input.label)].join(":");
}
```

Resolve canonical code against the records returned by `resolveCourseCodes`, preferring `nyu-shanghai` for `-SHU` codes and otherwise requiring one unambiguous active-release record. Zero records or multiple equally valid records are unavailable. Derive defaults without mutating input arrays.

- [ ] **Step 4: Run preview tests**

Run: `npm.cmd test -- src/lib/samplePlan.test.ts`

Expected: PASS for all five statuses, idempotency, and explicit conflict moves.

- [ ] **Step 5: Commit the preview engine**

```powershell
git add src/lib/samplePlan.ts src/lib/samplePlan.test.ts
git commit -m "feat: preview safe sample study plan imports"
```

### Task 9: Replace the Progress Checklist with Bulletin-First Rendering

**Files:**
- Create: `src/components/progress/BulletinRequirements.tsx`
- Create: `src/components/progress/BulletinRequirements.test.tsx`
- Create: `src/components/progress/SampleStudyPlan.tsx`
- Create: `src/components/progress/SampleStudyPlan.test.tsx`
- Create: `src/components/progress/SamplePlanPreviewDialog.tsx`
- Create: `src/components/progress/SamplePlanPreviewDialog.test.tsx`
- Modify: `src/components/progress/RequirementChecklist.tsx`
- Modify: `src/components/progress/RequirementChecklist.test.tsx`
- Modify: `src/lib/corrections/types.ts`
- Modify: `src/lib/corrections/types.test.ts`
- Modify: `src/components/corrections/ReportIssueDialog.tsx`
- Modify: `src/components/corrections/ReportIssueDialog.test.tsx`
- Modify: `src/lib/i18n/dictionaries.ts`
- Modify: `src/lib/i18n/dictionaries.test.ts`

**Interfaces:**
- Consumes: program display/interpretations/sample plan, preview engine, catalog cache, planner store.
- Produces: default `Bulletin requirements`, optional `Planner interpretation · Beta`, and adjacent `Sample study plan`.

- [ ] **Step 1: Write failing semantic UI tests**

```tsx
expect(screen.getByText("Select one of the following:")).toBeVisible();
expect(screen.getByText("MATH-SHU 235")).toHaveTextContent("Probability and Statistics");
expect(screen.queryByRole("button", { name: /mark.*fulfilled/i })).not.toBeInTheDocument();
expect(screen.getByText(/verified requirements only/i)).toBeVisible();
expect(screen.queryByText(/^\d+%$/)).not.toBeInTheDocument();
```

For sample plans, assert eight term headings, exact courses, placeholders, advisory copy, and `Use this sample plan` only when eligible.

Assert `Report requirement` submits `tableId` and `sourceIndex` in correction context for the selected source row/group.

- [ ] **Step 2: Run and confirm current UI failure**

Run: `npm.cmd test -- src/components/progress/BulletinRequirements.test.tsx src/components/progress/SampleStudyPlan.test.tsx src/components/progress/SamplePlanPreviewDialog.test.tsx src/components/progress/RequirementChecklist.test.tsx`

Expected: FAIL because the components do not exist and current UI surfaces structural manual actions.

- [ ] **Step 3: Implement accessible Bulletin rendering**

Use semantic `<table><caption><thead><tbody>` on desktop and the same ordered row data in stacked mobile presentation. Render headings/directives as noninteractive rows, exact course rows with planned/completed status text, source credits, footnotes, and exact Bulletin link. Never use `dangerouslySetInnerHTML`.

- [ ] **Step 4: Implement responsive sample-plan preview**

Use the existing dialog/sheet primitives inside a narrow client boundary. On open, call `CatalogClient.resolveCourseCodes()` once with the deduplicated exact codes from the sample plan, then build the preview. Render loading/error states, each preview status, default checkbox/choice state, conflict `Keep current term` versus `Move to recommended term`, warnings summary, and one `Apply selected` action calling `applySamplePlan()`.

- [ ] **Step 5: Integrate and remove structural evidence actions**

Keep `EvidenceRow` only for positively classified verified manual/waiver nodes. Make Bulletin view default; render authoritative percent only when non-null, otherwise label the verified-only fraction and coverage. Append `SampleStudyPlan` after requirements.

Extend `CorrectionContextSchema` and `ReportIssueContext` with optional `tableId` and `sourceIndex`. Source-row report actions populate both values plus program, requirement/group ID, release, snapshot, source URL, and displayed source text.

- [ ] **Step 6: Run Progress UI tests**

Run: `npm.cmd test -- src/components/progress/BulletinRequirements.test.tsx src/components/progress/SampleStudyPlan.test.tsx src/components/progress/SamplePlanPreviewDialog.test.tsx src/components/progress/RequirementChecklist.test.tsx src/lib/corrections/types.test.ts src/components/corrections/ReportIssueDialog.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit Bulletin-first Progress UI**

```powershell
git add src/components/progress/BulletinRequirements.tsx src/components/progress/BulletinRequirements.test.tsx src/components/progress/SampleStudyPlan.tsx src/components/progress/SampleStudyPlan.test.tsx src/components/progress/SamplePlanPreviewDialog.tsx src/components/progress/SamplePlanPreviewDialog.test.tsx src/components/progress/RequirementChecklist.tsx src/components/progress/RequirementChecklist.test.tsx src/lib/corrections/types.ts src/lib/corrections/types.test.ts src/components/corrections/ReportIssueDialog.tsx src/components/corrections/ReportIssueDialog.test.tsx src/lib/i18n/dictionaries.ts src/lib/i18n/dictionaries.test.ts
git commit -m "feat: show Bulletin-first requirements and sample plans"
```

### Task 10: Render and Replace Planning Slots on the Planner Board

**Files:**
- Create: `src/components/planner/PlanningSlotCard.tsx`
- Create: `src/components/planner/PlanningSlotCard.test.tsx`
- Modify: `src/components/planner/SemesterColumn.tsx`
- Modify: `src/components/planner/PlannerBoard.test.tsx`
- Modify: `src/components/catalog/CourseCatalog.tsx`
- Modify: `src/components/catalog/CourseCatalog.test.tsx`
- Modify: `src/components/PlannerApp.tsx`

**Interfaces:**
- Produces: same-semester slot replacement and catalog search hint handoff.
- Workload: fixed slot credits contribute to projected semester totals as tentative, never requirement completion.

- [ ] **Step 1: Write failing slot UI tests**

```tsx
expect(screen.getByText("Computer Science Elective")).toBeVisible();
expect(screen.getByText("Tentative · 4 cr")).toBeVisible();
await user.click(screen.getByRole("button", { name: /choose course/i }));
expect(mockOpenCatalog).toHaveBeenCalledWith({ query: "Computer Science Elective", slotId: "slot-1", semesterId: "Y3F" });
```

Assert selecting a catalog result replaces the slot atomically and Undo restores it.

- [ ] **Step 2: Run and confirm failure**

Run: `npm.cmd test -- src/components/planner/PlanningSlotCard.test.tsx src/components/planner/PlannerBoard.test.tsx src/components/catalog/CourseCatalog.test.tsx`

Expected: FAIL because slots are not rendered or replaceable.

- [ ] **Step 3: Implement slot cards and semester totals**

Render slots after exact placements in source/import order with distinct dashed styling, editable accessible label, remove action, and `Choose course`. Add fixed `slot.credits` to a separately labeled tentative workload value; do not insert slots into `coursesById`, allocation, requirements, or completed credits.

- [ ] **Step 4: Implement catalog handoff**

Add ephemeral `slotSelection` state in `PlannerApp`; initialize catalog query from the slot label. On course selection call `replacePlanningSlot(slotId, placementInput)` with the slot semester, then clear selection state.

- [ ] **Step 5: Run planner/catalog tests**

Run: `npm.cmd test -- src/components/planner/PlanningSlotCard.test.tsx src/components/planner/PlannerBoard.test.tsx src/components/catalog/CourseCatalog.test.tsx src/store/plannerStore.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit planner slot UI**

```powershell
git add src/components/planner/PlanningSlotCard.tsx src/components/planner/PlanningSlotCard.test.tsx src/components/planner/SemesterColumn.tsx src/components/planner/PlannerBoard.test.tsx src/components/catalog/CourseCatalog.tsx src/components/catalog/CourseCatalog.test.tsx src/components/PlannerApp.tsx
git commit -m "feat: replace sample-plan slots with catalog courses"
```

### Task 11: Include Planning Slots in JSON, Excel, and PDF Exports

**Files:**
- Modify: `src/lib/planExport/model.ts`
- Modify: `src/lib/planExport/model.test.ts`
- Modify: `src/lib/planExport/excel.ts`
- Modify: `src/lib/planExport/excel.test.ts`
- Modify: `src/lib/planExport/pdf.ts`
- Modify: `src/lib/planExport/pdf.test.ts`
- Modify: `src/lib/planExport/fixture.test-helper.ts`

**Interfaces:**
- Produces: `ExportPlanningSlot` and `ExportSemester.slots`.
- Safety: Excel continues to neutralize formula-leading user/source text through `safeCell()`.

- [ ] **Step 1: Add failing export-model assertions**

```ts
expect(model.semesters[0].slots).toEqual([{
  label: "General Elective",
  credits: 4,
  sourceProgramId: "computer-science-bs",
  tentative: true,
}]);
expect(model.credits.planned).toBe(courseCreditsOnly);
```

Assert Excel emits a `Planning Slot` row and PDF includes `General Elective (tentative)` without counting it as completed/requirement credit.

- [ ] **Step 2: Run and confirm failure**

Run: `npm.cmd test -- src/lib/planExport/model.test.ts src/lib/planExport/excel.test.ts src/lib/planExport/pdf.test.ts`

Expected: FAIL because exports omit slots.

- [ ] **Step 3: Extend export model and renderers**

Add slots to semesters, include a `Row Type` column in Excel, and render course/slot rows in the PDF schedule. Preserve the disclaimer and add: `Planning slots are tentative placeholders and do not represent registered or completed courses.`

- [ ] **Step 4: Run export tests**

Run: `npm.cmd test -- src/lib/planExport/model.test.ts src/lib/planExport/excel.test.ts src/lib/planExport/pdf.test.ts src/lib/planExport/download.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit export support**

```powershell
git add src/lib/planExport/model.ts src/lib/planExport/model.test.ts src/lib/planExport/excel.ts src/lib/planExport/excel.test.ts src/lib/planExport/pdf.ts src/lib/planExport/pdf.test.ts src/lib/planExport/fixture.test-helper.ts
git commit -m "feat: export sample-plan placeholders"
```

### Task 12: Add 43-Program Golden Certification and Operator Commands

**Files:**
- Create: `src/data/nyush-program-golden.json`
- Create: `scripts/certify-nyush-programs.ts`
- Create: `scripts/certify-nyush-programs.test.ts`
- Create: `scripts/publish-certified-nyush.ts`
- Create: `scripts/publish-certified-nyush.test.ts`
- Create: `scripts/regenerate-nyush-fallback.test.ts`
- Create: `src/app/api/admin/bulletin/status/route.test.ts`
- Modify: `src/app/api/admin/bulletin/status/route.ts`
- Create: `src/components/admin/BulletinCertificationStatus.tsx`
- Create: `src/components/admin/BulletinCertificationStatus.test.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `package.json`
- Modify: `scripts/regenerate-nyush-fallback.ts`
- Modify: `scripts/generate-catalog-fallback.ts`
- Modify: `docs/REQUIREMENTS.md`
- Create: `docs/releases/bulletin-requirement-rollout.md`

**Interfaces:**
- Produces commands: `catalog:generate-nyush-candidate`, `catalog:certify-nyush`, and `catalog:publish-certified-nyush`.
- Gate: publisher accepts only a report whose candidate snapshot hash matches, all 43 expected programs pass, and active release has not changed since dry run.

- [ ] **Step 1: Write failing command tests**

```ts
expect(evaluateCertification(golden, candidate)).toMatchObject({ ok: true, programCount: 43 });
expect(() => requirePublishableReport({ ...report, candidateHash: "stale" }, candidate)).toThrow(/hash/i);
expect(() => requireStableActiveRelease("release-a", "release-b")).toThrow(/changed/i);
expect(parseCandidateArgs(["--output=artifacts/nyu-shanghai-candidate.json"]).output).toBe("artifacts/nyu-shanghai-candidate.json");
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm.cmd test -- scripts/certify-nyush-programs.test.ts scripts/publish-certified-nyush.test.ts scripts/regenerate-nyush-fallback.test.ts`

Expected: FAIL because certification/publication scripts, candidate-output argument handling, and golden data do not exist.

- [ ] **Step 3: Populate and review the golden manifest**

For every one of the 43 current programs, record exact program ID, ordered final category names, selector counts/child counts, allowed manual-condition source texts, explicit totals, sample-plan term count, and expected named table groups. Do not bless generated output wholesale. Explicitly assert Data Science probability/concentrations and Computer Science eight-term sample plan.

- [ ] **Step 4: Implement certification and dry-run output**

`catalog:generate-nyush-candidate` uses the existing read-only live-Bulletin pipeline and requires `--output=artifacts/nyu-shanghai-candidate.json`; it never reads or writes Neon and never overwrites the checked-in fallback. `catalog:certify-nyush` reads that candidate or the fallback, emits `artifacts/nyush-certification-report.json`, prints pass/fail counts, and exits 1 on any mismatch. `catalog:publish-certified-nyush` defaults to dry run, writes no database state, and prints current release, candidate snapshot/hash, preserved New York memberships, and resulting release ID.

- [ ] **Step 5: Implement guarded atomic apply**

Only `--apply --report=artifacts/nyush-certification-report.json` may compose/activate. Re-read the active release immediately before the transaction; reject a changed pointer, stale report hash, incomplete source membership, or any failed certification. Never call `catalog:update-programs` or rewrite existing snapshot rows.

- [ ] **Step 6: Rewrite requirement and rollout documentation**

Document deterministic parsing/compiler semantics, verified/unavailable states, narrow manual-confirmation rules, sample plans, certification, dry run, activation, smoke checks, and release-pointer rollback. Remove the obsolete LLM extraction claim.

- [ ] **Step 7: Add read-only Admin certification diagnostics**

Extend the admin Bulletin status response with active-release totals and per-program entries:

```ts
{
  programId: string;
  interpretationCoverage: number;
  unavailableGroups: string[];
  selectorCount: number;
  manualConfirmationCount: number;
  samplePlanImportStatus: "eligible" | "display-only" | "absent";
}
```

Render a `Bulletin certification` card for admins and maintainers with release ID, pass/fail summary, filters for failed/partial programs, and diagnostics. Keep it read-only: no override or publish action. Test admin/maintainer authorization, unauthenticated/unauthorized responses, deterministic response ordering, loading/error UI, and mobile stacking.

- [ ] **Step 8: Run script, status API, and Admin UI tests plus help commands**

Run: `npm.cmd test -- scripts/certify-nyush-programs.test.ts scripts/publish-certified-nyush.test.ts scripts/regenerate-nyush-fallback.test.ts src/app/api/admin/bulletin/status/route.test.ts src/components/admin/BulletinCertificationStatus.test.tsx`

Run: `npm.cmd run catalog:generate-nyush-candidate -- --help`

Run: `npm.cmd run catalog:certify-nyush -- --help`

Run: `npm.cmd run catalog:publish-certified-nyush -- --help`

Expected: tests PASS; all three commands print usage and perform no network/database write in help mode.

- [ ] **Step 9: Commit certification tooling**

```powershell
git add src/data/nyush-program-golden.json scripts/certify-nyush-programs.ts scripts/certify-nyush-programs.test.ts scripts/publish-certified-nyush.ts scripts/publish-certified-nyush.test.ts scripts/regenerate-nyush-fallback.ts scripts/regenerate-nyush-fallback.test.ts src/app/api/admin/bulletin/status/route.ts src/app/api/admin/bulletin/status/route.test.ts src/components/admin/BulletinCertificationStatus.tsx src/components/admin/BulletinCertificationStatus.test.tsx src/app/admin/page.tsx package.json scripts/generate-catalog-fallback.ts docs/REQUIREMENTS.md docs/releases/bulletin-requirement-rollout.md
git commit -m "feat: certify Shanghai program catalogs before publication"
```

### Task 13: End-to-End, Accessibility, Candidate Generation, and Safe Activation

**Files:**
- Create: `tests/e2e/bulletin-requirements-sample-plan.spec.ts`
- Modify: `tests/e2e/accessibility-responsive.spec.ts`
- Modify: `tests/e2e/support/fixtures.ts`
- Modify: `tests/e2e/support/database.ts`
- Modify: `src/data/catalog-fallback.json`
- Create: `artifacts/nyu-shanghai-candidate.json` (generated verification artifact; never commit)
- Create: `artifacts/nyush-certification-report.json` (generated verification artifact; never commit)

**Interfaces:**
- Consumes: all prior tasks.
- Produces: certified fallback, browser evidence, and an atomically activated release with the previous release retained.

- [ ] **Step 1: Write failing Playwright scenarios**

```ts
test("Data Science renders one probability choice without manual action", async ({ page }) => {
  await openProgressFor(page, "Data Science (BS)");
  await expect(page.getByText("Select one of the following:")).toBeVisible();
  await expect(page.getByText("MATH-SHU 235")).toBeVisible();
  await expect(page.getByText("MATH-SHU 238")).toBeVisible();
  await expect(page.getByRole("button", { name: /mark.*fulfilled/i })).toHaveCount(0);
});

test("Computer Science sample plan previews, applies, and undoes", async ({ page }) => {
  await openProgressFor(page, "Computer Science (BS)");
  await page.getByRole("button", { name: "Use this sample plan" }).click();
  await expect(page.getByText("Chinese or EAP")).toBeVisible();
  await page.getByRole("button", { name: "Apply selected" }).click();
  await expect(page.getByText("Computer Science Elective")).toBeVisible();
  await page.getByRole("button", { name: /undo/i }).click();
  await expect(page.getByText("Computer Science Elective")).toHaveCount(0);
});
```

- [ ] **Step 2: Run focused E2E against the seeded fixture and confirm failure**

Run: `npm.cmd run test:e2e -- tests/e2e/bulletin-requirements-sample-plan.spec.ts`

Expected: FAIL before fixtures/UI are wired.

- [ ] **Step 3: Seed rich Data Science and Computer Science fixtures**

Extend deterministic E2E bootstrap data with source display, interpretations, and the eight-term sample plan. Keep the fixture release fully local and independent of the live Bulletin/Neon.

- [ ] **Step 4: Run the complete local verification suite**

Run: `npm.cmd test`

Run: `npm.cmd run lint`

Run: `npm.cmd run build`

Run: `npm.cmd run test:e2e -- tests/e2e/bulletin-requirements-sample-plan.spec.ts tests/e2e/accessibility-responsive.spec.ts tests/e2e/plan-safety.spec.ts`

Expected: all commands exit 0; no axe serious/critical violations; mobile viewport has no page-level horizontal overflow.

- [ ] **Step 5: Generate and certify a fresh Shanghai candidate without activation**

Run: `npm.cmd run catalog:generate-nyush-candidate -- --output=artifacts/nyu-shanghai-candidate.json`

Run: `npm.cmd run catalog:certify-nyush -- --candidate=artifacts/nyu-shanghai-candidate.json --output=artifacts/nyush-certification-report.json`

Run: `npm.cmd run catalog:publish-certified-nyush -- --report=artifacts/nyush-certification-report.json`

Expected: candidate generation fetches Bulletin pages and writes only the requested local artifact; 43/43 programs pass with zero selector-like manuals, generic categories, unavailable requirement interpretations, and governed-row coverage errors; publication dry run reports one new Shanghai snapshot plus unchanged active New York memberships and performs no database write.

- [ ] **Step 6: Regenerate and revalidate the checked-in fallback**

Run: `npm.cmd run catalog:generate-fallback -- --candidate=artifacts/nyu-shanghai-candidate.json`

Run: `npm.cmd run catalog:certify-nyush -- --candidate=src/data/catalog-fallback.json`

Expected: PASS with the same Shanghai certification hash/semantics as the candidate.

- [ ] **Step 7: Commit tested E2E coverage and certified fallback**

```powershell
git add tests/e2e/bulletin-requirements-sample-plan.spec.ts tests/e2e/accessibility-responsive.spec.ts tests/e2e/support/fixtures.ts tests/e2e/support/database.ts src/data/catalog-fallback.json
git commit -m "test: certify Bulletin requirements and sample-plan flows"
```

- [ ] **Step 8: Deploy the backward-compatible application build before data activation**

Deploy through the repository's existing Vercel/GitHub workflow. Verify `/api/catalog/bootstrap` still serves the previous active release and the application reads both old and new program/plan shapes. Do not activate the candidate until this build is healthy.

- [ ] **Step 9: Atomically activate the certified release**

Run: `npm.cmd run catalog:publish-certified-nyush -- --apply --report=artifacts/nyush-certification-report.json`

Expected: the command rechecks the active pointer and report hash, composes one source-complete release, activates it transactionally, prints both new and previous release IDs, and leaves the previous release immutable for rollback.

- [ ] **Step 10: Run production API and browser smoke tests**

Verify `https://nyush-course-planner.vercel.app/api/catalog/bootstrap` reports the new release and preserves all configured New York memberships. In the production browser verify Data Science probability/concentrations, Core IPC, one minor, Computer Science sample-plan preview/apply/undo, exact-course conflict preservation, JSON/Excel/PDF slot exports, and a mobile viewport.

- [ ] **Step 11: Roll back on any failed production assertion**

Use the release-pointer rollback command documented in `docs/releases/bulletin-requirement-rollout.md` to reactivate the printed previous release ID. Do not delete the failed release, candidate, diagnostics, user plans, corrections, or overlays.

---

## Final Verification Checklist

- [ ] `npm.cmd test` exits 0.
- [ ] `npm.cmd run lint` exits 0.
- [ ] `npm.cmd run build` exits 0 under Next.js 16.2.9.
- [ ] Focused Playwright tests exit 0 on desktop and mobile.
- [ ] All 43 Shanghai programs pass golden certification.
- [ ] Data Science MATH-SHU 235/MATH-SHU 238 is `choose(1)` and concentrations retain names/tables.
- [ ] Structural headings/directives expose no fulfillment actions.
- [ ] Unverified programs expose no authoritative whole-program percentage.
- [ ] Computer Science preserves eight sample terms, exact courses, placeholders, and 128 source credits.
- [ ] Sample-plan import preserves conflicting course locations by default, is idempotent, and undoes in one step.
- [ ] Planning slots survive local/cloud/JSON/Excel/PDF round trips and never count as completed requirements.
- [ ] Certified fallback and candidate have matching Shanghai semantics.
- [ ] New York memberships and study-away discovery remain unchanged.
- [ ] Previous production release remains available for pointer rollback.
