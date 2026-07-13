# Bulletin Synchronization and Backend Repairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Albert-centered reference data with an automatically published, versioned NYU Shanghai Bulletin snapshot and repair the confirmed backend/domain defects.

**Architecture:** A deterministic CourseLeaf scraper produces lossless source documents, normalizes supported rules into a recursive requirement AST, validates a complete candidate, then atomically activates snapshot-scoped course/program rows. Existing planner facts remain backward compatible while engines gain variable-credit, waiver, manual-confirmation, and dynamic-program support.

**Tech Stack:** Next.js 16.2.9 Route Handlers, TypeScript 5, Zod 4, Cheerio, Drizzle ORM, PostgreSQL/PGlite, Vitest 4, tsx.

## Global Constraints

- Read relevant bundled Next.js guides in `node_modules/next/dist/docs/` before changing Next code.
- Use only public allowed Bulletin pages: Shanghai programs, courses, Core Curriculum, and sitemap.
- Bulletin content publishes automatically only as a complete, schema-valid, atomic snapshot.
- Preserve the previous active snapshot on every failure.
- Do not repair or extend Albert connectivity.
- Keep the product interface and persisted official text in English.
- Follow red-green-refactor: every production behavior starts with a test observed failing for the expected reason.
- Preserve all unrelated dirty-worktree changes and stage only files owned by the current task.

---

## File Structure

### New source modules

- `src/lib/bulletin/constants.ts` — canonical allowed URLs and source identity checks.
- `src/lib/bulletin/sourceTypes.ts` — lossless source-document schemas.
- `src/lib/bulletin/fetch.ts` — bounded retrying fetch abstraction.
- `src/lib/bulletin/discover.ts` — program/subject/sitemap enumeration.
- `src/lib/bulletin/parseCoursePage.ts` — `.courseblock` parser.
- `src/lib/bulletin/parseProgramPage.ts` — curriculum, plan, policy, and footnote parser.
- `src/lib/bulletin/normalize.ts` — source documents to executable courses/programs.
- `src/lib/bulletin/validateSnapshot.ts` — publication gates and validation report.
- `src/lib/bulletin/sync.ts` — orchestration and no-op hash detection.
- `src/lib/bulletin/*.test.ts` — fixture-backed unit tests.
- `src/lib/bulletin/__fixtures__/*.html` — minimal authored CourseLeaf-shaped fixtures.
- `scripts/sync-bulletin.ts` — CLI entry point.

### New persistence/API modules

- `src/lib/catalogRepository.ts` — snapshot candidate writes, activation, reads, status.
- `src/app/api/admin/bulletin/sync/route.ts` — admin trigger.
- `src/app/api/admin/bulletin/status/route.ts` — admin diagnostics.
- `src/lib/adminAuth.ts` — shared admin gate.
- New Drizzle migration generated from `src/db/schema.ts`.

### Existing modules changed

- `src/lib/types.ts` — recursive requirements, provenance, credit ranges, fulfillment facts.
- `src/db/schema.ts` — snapshot tables and active-plan uniqueness.
- `src/lib/repository.ts` — atomic active-plan upsert and guarded deletion.
- `src/lib/planIO.ts` — grade, selected credits, fulfillment-fact preservation.
- `src/lib/progress.ts`, `allocation.ts`, `validation.ts`, `feasibility.ts` — recursive rules and placement-credit helper.
- `src/app/api/catalog/route.ts` — coherent active-snapshot response.
- `src/app/api/plan/route.ts` — updated validation.
- `src/app/api/parse-course/route.ts` — authenticated preview only.
- `src/auth.ts` — production-safe provider construction.
- `package.json`, `package-lock.json` — Cheerio/tsx and sync command.

---

### Task 1: Install parser/CLI dependencies and extend domain primitives

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/lib/types.ts`
- Create: `src/lib/credits.ts`
- Create: `src/lib/credits.test.ts`

**Interfaces:**
- Produces: `RequirementNode`, `RequirementNodeSchema`, `FulfillmentFact`, `CatalogProvenance`, `placementCredits(placement, course)`.
- Preserves: legacy `allOf`, `chooseN`, and `creditsFrom` records remain parseable during migration.

- [ ] **Step 1: Install deterministic HTML and TypeScript CLI dependencies**

Run:

```powershell
npm.cmd install cheerio
npm.cmd install -D tsx
```

Expected: `package.json` contains `cheerio` and `tsx`; lockfile updates without audit errors that block installation.

- [ ] **Step 2: Write failing credit-range tests**

Create `src/lib/credits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { placementCredits } from "@/lib/credits";
import type { Course, Placement } from "@/lib/types";

const course: Course = {
  id: "TEST-SHU 997",
  title: "Independent Study",
  credits: 4,
  minCredits: 2,
  maxCredits: 4,
  department: "TEST-SHU",
  prereqs: [],
  offered: [],
  offeringKnown: false,
  sites: ["shanghai"],
  fulfills: [],
  equivalentTo: [],
  attributes: [],
  tags: [],
};

describe("placementCredits", () => {
  it("uses a valid selected credit value", () => {
    const placement: Placement = {
      courseId: course.id,
      semesterId: "Y1F",
      allocation: "auto",
      selectedCredits: 2,
    };
    expect(placementCredits(placement, course)).toBe(2);
  });

  it("falls back to the catalog default outside the range", () => {
    const placement: Placement = {
      courseId: course.id,
      semesterId: "Y1F",
      allocation: "auto",
      selectedCredits: 8,
    };
    expect(placementCredits(placement, course)).toBe(4);
  });
});
```

- [ ] **Step 3: Run RED**

Run: `npm.cmd test -- src/lib/credits.test.ts`

Expected: FAIL because `@/lib/credits` and new fields do not exist.

- [ ] **Step 4: Add backward-compatible schemas and helper**

In `src/lib/types.ts`, add recursive nodes while retaining legacy rule kinds:

```ts
export type RequirementNode =
  | { kind: "course"; courseId: string }
  | { kind: "all"; children: RequirementNode[] }
  | { kind: "any"; children: RequirementNode[] }
  | { kind: "choose"; count: number; children: RequirementNode[] }
  | { kind: "credits"; minimum: number; children: RequirementNode[] }
  | { kind: "attribute"; attribute: string }
  | { kind: "exclusion"; excludedCourseIds: string[]; child: RequirementNode }
  | { kind: "waiver"; waiverId: string; label: string }
  | { kind: "manualConfirmation"; label: string; sourceText: string };

export const RequirementNodeSchema: z.ZodType<RequirementNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("course"), courseId: z.string().min(1) }),
    z.object({ kind: z.literal("all"), children: z.array(RequirementNodeSchema).min(1) }),
    z.object({ kind: z.literal("any"), children: z.array(RequirementNodeSchema).min(1) }),
    z.object({ kind: z.literal("choose"), count: z.number().int().positive(), children: z.array(RequirementNodeSchema).min(1) }),
    z.object({ kind: z.literal("credits"), minimum: z.number().positive(), children: z.array(RequirementNodeSchema).min(1) }),
    z.object({ kind: z.literal("attribute"), attribute: z.string().min(1) }),
    z.object({ kind: z.literal("exclusion"), excludedCourseIds: z.array(z.string()), child: RequirementNodeSchema }),
    z.object({ kind: z.literal("waiver"), waiverId: z.string().min(1), label: z.string().min(1) }),
    z.object({ kind: z.literal("manualConfirmation"), label: z.string().min(1), sourceText: z.string().min(1) }),
  ]),
);
```

Extend `CourseSchema` with optional/defaulted `minCredits`, `maxCredits`, `creditsText`, `offeringText`, `offeringKnown`, `prerequisiteText`, `attributes`, and `provenance`. Change `offered` to allow an empty array only when `offeringKnown` is false. Extend `Placement` with `selectedCredits?: number`, and `PlanSnapshot` with `fulfillmentFacts: FulfillmentFact[]` defaulted during import.

Create `src/lib/credits.ts`:

```ts
import type { Course, Placement } from "@/lib/types";

export function placementCredits(placement: Placement, course: Course): number {
  const minimum = course.minCredits ?? course.credits;
  const maximum = course.maxCredits ?? course.credits;
  const selected = placement.selectedCredits;
  return selected !== undefined && selected >= minimum && selected <= maximum
    ? selected
    : course.credits;
}
```

- [ ] **Step 5: Run GREEN and the existing domain suite**

Run:

```powershell
npm.cmd test -- src/lib/credits.test.ts
npm.cmd test -- src/lib/data.test.ts src/lib/engines.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json src/lib/types.ts src/lib/credits.ts src/lib/credits.test.ts
git commit -m "feat: add bulletin requirement and credit primitives"
```

---

### Task 2: Discover allowed Bulletin sources with bounded fetching

**Files:**
- Create: `src/lib/bulletin/constants.ts`
- Create: `src/lib/bulletin/sourceTypes.ts`
- Create: `src/lib/bulletin/fetch.ts`
- Create: `src/lib/bulletin/discover.ts`
- Create: `src/lib/bulletin/discover.test.ts`
- Create: `src/lib/bulletin/__fixtures__/program-index.html`
- Create: `src/lib/bulletin/__fixtures__/course-index.html`
- Create: `src/lib/bulletin/__fixtures__/sitemap.xml`

**Interfaces:**
- Consumes: injected `BulletinFetch` function.
- Produces: `discoverBulletinSources(fetcher): Promise<BulletinDiscovery>`.

- [ ] **Step 1: Author minimal fixtures and failing discovery tests**

The fixture must contain one BS link, one minor link, two subject links, and matching sitemap entries. Test:

```ts
import { describe, expect, it } from "vitest";
import { discoverBulletinSources } from "@/lib/bulletin/discover";

it("classifies degree programs and subjects from authoritative indexes", async () => {
  const pages = new Map<string, string>([
    ["https://bulletins.nyu.edu/undergraduate/shanghai/programs/", PROGRAM_INDEX],
    ["https://bulletins.nyu.edu/undergraduate/shanghai/courses/", COURSE_INDEX],
    ["https://bulletins.nyu.edu/sitemap.xml", SITEMAP],
  ]);
  const result = await discoverBulletinSources(async (url) => pages.get(url) ?? "");
  expect(result.majors.map((x) => x.slug)).toEqual(["computer-science-bs"]);
  expect(result.minors.map((x) => x.slug)).toEqual(["computer-science-minor"]);
  expect(result.subjects.map((x) => x.slug)).toEqual(["csci-shu", "math-shu"]);
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/lib/bulletin/discover.test.ts`

Expected: FAIL because discovery modules do not exist.

- [ ] **Step 3: Implement allowlisted discovery and fetch policy**

`fetch.ts` exposes:

```ts
export type BulletinFetch = (url: string) => Promise<string>;

export function createBulletinFetch(options: {
  timeoutMs: number;
  retries: number;
  userAgent: string;
}): BulletinFetch;
```

`discover.ts` parses indexes with Cheerio, accepts only `https://bulletins.nyu.edu/undergraduate/shanghai/...`, classifies credentials from link text, canonicalizes URLs, and cross-checks sitemap membership. A missing index identity heading, empty discovered set, off-domain URL, or sitemap mismatch throws `BulletinDiscoveryError` with a safe message.

- [ ] **Step 4: Run GREEN**

Run: `npm.cmd test -- src/lib/bulletin/discover.test.ts`

Expected: PASS, including rejection tests for off-domain and empty indexes.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/bulletin/constants.ts src/lib/bulletin/sourceTypes.ts src/lib/bulletin/fetch.ts src/lib/bulletin/discover.ts src/lib/bulletin/discover.test.ts src/lib/bulletin/__fixtures__
git commit -m "feat: discover allowed bulletin sources"
```

---

### Task 3: Parse complete subject-course pages

**Files:**
- Create: `src/lib/bulletin/parseCoursePage.ts`
- Create: `src/lib/bulletin/parseCoursePage.test.ts`
- Create: `src/lib/bulletin/__fixtures__/course-page.html`

**Interfaces:**
- Produces: `parseCoursePage(html, sourceMeta): BulletinSourceDocument` containing `SourceCourse[]`.

- [ ] **Step 1: Write a failing representative parser test**

```ts
it("preserves course fields, linked prerequisites, and attributes", () => {
  const page = parseCoursePage(COURSE_PAGE, META);
  expect(page.courses[0]).toMatchObject({
    code: "CSCI-SHU 101",
    title: "Introduction to Computer Science",
    creditsText: "4 Credits",
    offeringText: "Fall and Spring",
    prerequisiteText: "CSCI-SHU 11 Introduction to Computer Programming or placement exam.",
    linkedCourseIds: ["CSCI-SHU 11"],
    attributes: ["Algorithmic Thinking", "Computer Science Required"],
  });
});
```

Add failures for duplicate code, missing title, credit range `2-4 Credits`, and `occasionally` offering text.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/lib/bulletin/parseCoursePage.test.ts`

Expected: FAIL because parser is absent.

- [ ] **Step 3: Implement selector-based parsing**

Parse only within `.courseblock`; normalize whitespace/non-breaking spaces; remove label text without removing linked codes; retain description HTML as plain text; preserve raw fields. Throw `BulletinParseError` when any block lacks a unique code/title or its page identity is not a Shanghai subject page.

- [ ] **Step 4: Run GREEN**

Run: `npm.cmd test -- src/lib/bulletin/parseCoursePage.test.ts`

Expected: all course parser tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/bulletin/parseCoursePage.ts src/lib/bulletin/parseCoursePage.test.ts src/lib/bulletin/__fixtures__/course-page.html
git commit -m "feat: parse bulletin course inventories"
```

---

### Task 4: Parse program, Core, policy, and sample-plan documents

**Files:**
- Create: `src/lib/bulletin/parseProgramPage.ts`
- Create: `src/lib/bulletin/parseProgramPage.test.ts`
- Create: `src/lib/bulletin/__fixtures__/program-page.html`
- Create: `src/lib/bulletin/__fixtures__/core-page.html`

**Interfaces:**
- Produces: ordered source sections/tables with typed row roles.

- [ ] **Step 1: Write failing program/Core tests**

Tests assert that `areaheader`, `areasubheader`, course, comment, and total rows retain order; credits ranges and footnote markers are preserved; sample-plan tables are separate from requirements; policies and exam waivers remain source sections.

```ts
expect(document.requirementTables[0].rows.map((row) => row.role)).toEqual([
  "areaHeader",
  "areaSubheader",
  "course",
  "comment",
  "total",
]);
expect(document.samplePlan?.terms).toHaveLength(8);
expect(document.policies[0].text).toContain("advisor");
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/lib/bulletin/parseProgramPage.test.ts`

Expected: FAIL because parser is absent.

- [ ] **Step 3: Implement lossless table/section parsing**

Use the approved CourseLeaf selectors, source anchors, and ordered row types. Do not interpret requirement semantics in this module. Fail on missing program identity, missing requirements for a BA/BS page, duplicate table IDs, or row-order loss.

- [ ] **Step 4: Run GREEN**

Run: `npm.cmd test -- src/lib/bulletin/parseProgramPage.test.ts`

Expected: PASS for major and Core fixtures.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/bulletin/parseProgramPage.ts src/lib/bulletin/parseProgramPage.test.ts src/lib/bulletin/__fixtures__/program-page.html src/lib/bulletin/__fixtures__/core-page.html
git commit -m "feat: parse bulletin program documents"
```

---

### Task 5: Normalize courses and requirement AST without guessing

**Files:**
- Create: `src/lib/bulletin/normalize.ts`
- Create: `src/lib/bulletin/normalize.test.ts`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: `normalizeBulletin(discovery, documents): CatalogCandidate`.
- Guarantees: every source row is represented by an executable node or `manualConfirmation` with source text.

- [ ] **Step 1: Write failing normalization tests**

Cover exact course, `Select one`, credit pool, attribute pool, exclusion, waiver, manual advisor rule, 0-credit course, variable credit, known offering, unknown offering, and external NYU course reference.

```ts
expect(candidate.programs[0].categories[0].requirement).toEqual({
  kind: "choose",
  count: 1,
  children: [
    { kind: "course", courseId: "MATH-SHU 235" },
    { kind: "course", courseId: "MATH-SHU 238" },
  ],
});
expect(candidate.programs[0].categories.at(-1)?.requirement.kind).toBe(
  "manualConfirmation",
);
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/lib/bulletin/normalize.test.ts`

Expected: FAIL because normalizer is absent.

- [ ] **Step 3: Implement conservative normalization**

Use explicit row patterns only. Convert attribute tables to `attribute` nodes. Build `fulfills` entries by traversing each category requirement and matching direct course IDs/attributes. Keep raw prerequisite text; normalize only linked course codes into conservative AND-of-OR groups when the connective structure is explicit. Set `offeringKnown: false` for `occasionally`, `every year`, or missing terms.

- [ ] **Step 4: Run GREEN and schema round-trip**

Run:

```powershell
npm.cmd test -- src/lib/bulletin/normalize.test.ts
npm.cmd test -- src/lib/data.test.ts
```

Expected: PASS; legacy bundled JSON still parses.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/bulletin/normalize.ts src/lib/bulletin/normalize.test.ts src/lib/types.ts
git commit -m "feat: normalize bulletin requirements safely"
```

---

### Task 6: Validate complete candidates and content-hash no-ops

**Files:**
- Create: `src/lib/bulletin/validateSnapshot.ts`
- Create: `src/lib/bulletin/validateSnapshot.test.ts`

**Interfaces:**
- Produces: `validateCatalogCandidate(candidate): SnapshotValidationReport`.
- Throws only through `assertPublishable(report)` at the publication boundary.

- [ ] **Step 1: Write failing validation-gate tests**

Test duplicate IDs, missing discovered page, missing title, broken local reference, explicit external reference, empty catalog, source-row coverage, and warning-only manual confirmations.

```ts
const report = validateCatalogCandidate(candidate);
expect(report.errors).toEqual([]);
expect(report.warnings).toContainEqual(
  expect.objectContaining({ code: "manual-confirmation" }),
);
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/lib/bulletin/validateSnapshot.test.ts`

Expected: FAIL because validator is absent.

- [ ] **Step 3: Implement deterministic validation report**

Sort diagnostics by code/source URL, include counts/hashes, and compare discovered URLs with fetched documents. `assertPublishable` throws `BulletinValidationError` containing codes but no raw HTML.

- [ ] **Step 4: Run GREEN**

Run: `npm.cmd test -- src/lib/bulletin/validateSnapshot.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/bulletin/validateSnapshot.ts src/lib/bulletin/validateSnapshot.test.ts
git commit -m "feat: validate bulletin snapshot candidates"
```

---

### Task 7: Add versioned snapshot tables and atomic publication

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0003_bulletin_snapshots.sql`
- Create: `drizzle/meta/0003_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Create: `src/lib/catalogRepository.ts`
- Create: `src/lib/catalogRepository.test.ts`

**Interfaces:**
- Produces: `publishCatalogCandidate(db, candidate, report)`, `getActiveCatalog(db)`, `getCatalogStatus(db)`.

- [ ] **Step 1: Write failing repository integration tests**

Using in-memory PGlite and migrations, verify:

1. publishing candidate A makes A active;
2. publishing B retires A and returns B coherently;
3. an injected write failure rolls back and leaves A active;
4. only one active snapshot can exist.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/lib/catalogRepository.test.ts`

Expected: FAIL because tables/repository are absent.

- [ ] **Step 3: Add snapshot-scoped schema**

Add `catalogSnapshot`, `catalogSourceDocument`, `catalogCourse`, and `catalogProgram` tables. Use composite primary keys for `(snapshotId, courseId)` and `(snapshotId, programId)`, cascading foreign keys, JSONB validated on reads, and a partial unique index permitting only one `status = 'active'` snapshot. Add the partial unique active-plan index needed by Task 10 in this same schema change so the migration is generated once.

- [ ] **Step 4: Generate and inspect migration**

Run: `npm.cmd run db:generate`. Rename the generated `drizzle/0003_*.sql` file to `drizzle/0003_bulletin_snapshots.sql`, then change the new `_journal.json` entry's `tag` to `0003_bulletin_snapshots`; do not alter the generated SQL or `drizzle/meta/0003_snapshot.json` contents by hand.

Expected: one new migration; inspect it to confirm no destructive alteration of existing user/course/rule tables.

- [ ] **Step 5: Implement transaction and run GREEN**

`publishCatalogCandidate` inserts a `building` snapshot, all documents/courses/programs, validates persisted counts, retires the old active row, activates the candidate, and commits in one `db.transaction`. It records `failed` only when failure occurs before the activation transaction; it never partially activates.

Run: `npm.cmd test -- src/lib/catalogRepository.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/db/schema.ts drizzle src/lib/catalogRepository.ts src/lib/catalogRepository.test.ts
git commit -m "feat: publish versioned catalog snapshots"
```

---

### Task 8: Orchestrate synchronization through CLI and admin APIs

**Files:**
- Create: `src/lib/bulletin/sync.ts`
- Create: `src/lib/bulletin/sync.test.ts`
- Create: `scripts/sync-bulletin.ts`
- Create: `src/lib/adminAuth.ts`
- Create: `src/app/api/admin/bulletin/sync/route.ts`
- Create: `src/app/api/admin/bulletin/status/route.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `syncBulletin({ fetcher, db, now }): Promise<SyncResult>`.

- [ ] **Step 1: Write failing orchestration tests**

Test stage order, unchanged-hash no-op, fetch failure without repository writes, validation failure without activation, successful publication, and one-sync-at-a-time rejection.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/lib/bulletin/sync.test.ts`

Expected: FAIL because orchestrator is absent.

- [ ] **Step 3: Implement orchestrator and CLI**

Add script:

```json
"bulletin:sync": "tsx scripts/sync-bulletin.ts"
```

The CLI exits `0` for published/no-op and `1` for failure, prints snapshot ID/counts only, and never prints raw HTML or secrets.

- [ ] **Step 4: Add shared admin gate and dynamic Route Handlers**

`requireAdmin()` returns the current existing 401/403 contract. `POST /api/admin/bulletin/sync` invokes the orchestrator; `GET /api/admin/bulletin/status` reads status. Do not add `force-static`; database-backed handlers remain dynamic under Next 16.

- [ ] **Step 5: Run GREEN and route type check**

Run:

```powershell
npm.cmd test -- src/lib/bulletin/sync.test.ts
npx.cmd tsc --noEmit
```

Expected: PASS and no type errors.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/bulletin/sync.ts src/lib/bulletin/sync.test.ts scripts/sync-bulletin.ts src/lib/adminAuth.ts src/app/api/admin/bulletin package.json package-lock.json
git commit -m "feat: expose bulletin synchronization"
```

---

### Task 9: Serve one coherent active catalog and generated fallback

**Files:**
- Modify: `src/app/api/catalog/route.ts`
- Modify: `src/lib/repository.ts`
- Create: `scripts/generate-catalog-fallback.ts`
- Create: `src/data/catalog-fallback.json`
- Modify: `src/lib/data.ts`
- Modify: `package.json`
- Create: `src/lib/catalogResponse.test.ts`

**Interfaces:**
- Produces: `CatalogResponseSchema` with snapshot, courses, programs, and rules.

- [ ] **Step 1: Write failing response/fallback tests**

Assert that active snapshot data is coherent, database failure falls back to generated last-known-good data, and an existing active snapshot is never converted to an empty HTTP 200 payload.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/lib/catalogResponse.test.ts`

Expected: FAIL on missing response schema/fallback.

- [ ] **Step 3: Implement active response and fallback generator**

Add `catalog:generate-fallback` script. The generator reads the active snapshot, validates it, writes stable sorted JSON, and refuses to overwrite the fallback with empty data. `data.ts` loads that snapshot instead of independently curated `programs.json`/`courses.json` after the first successful generation.

- [ ] **Step 4: Run GREEN**

Run:

```powershell
npm.cmd test -- src/lib/catalogResponse.test.ts src/lib/data.test.ts
npx.cmd tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/app/api/catalog/route.ts src/lib/repository.ts scripts/generate-catalog-fallback.ts src/data/catalog-fallback.json src/lib/data.ts src/lib/catalogResponse.test.ts package.json package-lock.json
git commit -m "feat: serve active bulletin catalog"
```

---

### Task 10: Preserve grades, variable credits, fulfillment facts, and one active plan

**Files:**
- Create: `src/lib/planIO.test.ts`
- Modify: `src/lib/planIO.ts`
- Modify: `src/store/plannerStore.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/repository.test.ts`

**Interfaces:**
- Produces: atomic `saveActivePlan` upsert and lossless plan round-trip.

- [ ] **Step 1: Write failing import and concurrency tests**

`planIO.test.ts` must assert preservation of `expectedGrade`, `selectedCredits`, and `fulfillmentFacts`. Repository tests must run two first saves concurrently and assert one active row.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/lib/planIO.test.ts src/lib/repository.test.ts`

Expected: plan import drops new fields and/or concurrent save violates the expectation.

- [ ] **Step 3: Implement schema preservation and database uniqueness**

Use `GradeSchema.optional()`, bounded selected credits, and fulfillment-fact schemas in `SnapshotSchema`. Use the partial unique active-plan index generated in Task 7, replace read-then-write with `insert(...).onConflictDoUpdate(...)`, and filter `getActivePlan` by `isActive = true`.

- [ ] **Step 4: Run GREEN**

Run: `npm.cmd test -- src/lib/planIO.test.ts src/lib/repository.test.ts`

Expected: PASS with exactly one active plan row.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/planIO.ts src/lib/planIO.test.ts src/store/plannerStore.ts src/db/schema.ts drizzle src/lib/repository.ts src/lib/repository.test.ts
git commit -m "fix: preserve plan facts and upsert active plans"
```

---

### Task 11: Gate production auth, paid parsing, and shared-course deletion

**Files:**
- Create: `src/auth.providers.test.ts`
- Modify: `src/auth.ts`
- Modify: `src/app/api/parse-course/route.ts`
- Modify: `src/app/api/admin/courses/route.ts`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/repository.test.ts`

**Interfaces:**
- Produces: `buildProviders(env)`, authenticated parse preview, `CourseReferencedError`.

- [ ] **Step 1: Write failing provider and deletion-guard tests**

```ts
expect(buildProviders({ NODE_ENV: "production" })).not.toContainEqual(
  expect.objectContaining({ id: "nyu-email" }),
);
expect(buildProviders({ NODE_ENV: "development" })).toContainEqual(
  expect.objectContaining({ id: "nyu-email" }),
);
```

Repository tests create a program requirement and plan placement referencing a course and expect `deleteCourse` to throw `CourseReferencedError` with reference categories.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- src/auth.providers.test.ts src/lib/repository.test.ts`

Expected: production includes the console provider and deletion succeeds incorrectly.

- [ ] **Step 3: Implement safe provider construction and endpoint gates**

Make the console provider conditional on `NODE_ENV !== "production"`. Require authenticated NYU user for personal parse preview; reuse `requireAdmin` for shared AI imports. Keep Albert route present but remove it from primary flows in the frontend plan.

- [ ] **Step 4: Implement reference guard**

`findCourseReferences` inspects active snapshot programs/rules and persisted plan placements. `deleteCourse` rejects referenced IDs and the API returns HTTP 409 with a safe list of reference kinds.

- [ ] **Step 5: Run GREEN**

Run:

```powershell
npm.cmd test -- src/auth.providers.test.ts src/lib/repository.test.ts
npx.cmd tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/auth.ts src/auth.providers.test.ts src/app/api/parse-course/route.ts src/app/api/admin/courses/route.ts src/lib/repository.ts src/lib/repository.test.ts
git commit -m "fix: harden auth and catalog mutations"
```

---

### Task 12: Update engines for recursive requirements and placement credits

**Files:**
- Modify: `src/lib/progress.ts`
- Modify: `src/lib/allocation.ts`
- Modify: `src/lib/validation.ts`
- Modify: `src/lib/feasibility.ts`
- Create: `src/lib/requirements.ts`
- Create: `src/lib/requirements.test.ts`
- Modify: `src/lib/engines.test.ts`
- Modify: `src/lib/feasibility.test.ts`

**Interfaces:**
- Produces: `evaluateRequirement(node, context)` and `requirementDemand(node)`.

- [ ] **Step 1: Write failing recursive-evaluator tests**

Test `all`, `any`, `choose`, `credits`, attribute, exclusion, waiver, and manual-confirmation states using real course/placement maps. Test selected credits in progress and load warnings. Test unknown offerings generate no `not-offered` warning.

- [ ] **Step 2: Run RED**

Run:

```powershell
npm.cmd test -- src/lib/requirements.test.ts src/lib/engines.test.ts src/lib/feasibility.test.ts
```

Expected: FAIL because recursive evaluation and placement credits are unsupported.

- [ ] **Step 3: Implement pure evaluator and adapt engines**

`evaluateRequirement` returns planned/completed fractions, matched/missing IDs, unit kind, and manual state without mutating inputs. Progress uses it per category. Allocation uses `requirementDemand`. Credit totals and validation use `placementCredits`. Feasibility schedules only deterministic missing courses and reports manual/waiver gaps separately instead of fabricating a course.

- [ ] **Step 4: Replace static program maps at engine boundaries**

All engine callers receive programs/program maps from the active catalog context. Remove imports of `PROGRAMS_BY_ID` from reusable engine helpers where a dynamic map can be injected.

- [ ] **Step 5: Run GREEN and full domain regression**

Run: `npm.cmd test`

Expected: all tests PASS with no warnings or unhandled rejections.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/requirements.ts src/lib/requirements.test.ts src/lib/progress.ts src/lib/allocation.ts src/lib/validation.ts src/lib/feasibility.ts src/lib/engines.test.ts src/lib/feasibility.test.ts
git commit -m "feat: evaluate bulletin requirements in planner engines"
```

---

### Task 13: Run a real Bulletin synchronization and final backend verification

**Files:**
- Modify: `src/data/catalog-fallback.json` only through the generator
- Modify: `README.md`

**Interfaces:**
- Validates the real official source against the fixture-driven implementation.

- [ ] **Step 1: Run all offline verification first**

Run:

```powershell
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 2: Run a real synchronization against NYU Bulletin**

Run: `npm.cmd run bulletin:sync`

Expected: output reports one published or unchanged snapshot, non-zero major/subject/course counts, and zero validation errors. If network permission is required, request it for this exact command.

- [ ] **Step 3: Generate and validate fallback**

Run:

```powershell
npm.cmd run catalog:generate-fallback
npm.cmd test -- src/lib/data.test.ts
```

Expected: fallback contains the active snapshot and data test passes.

- [ ] **Step 4: Run production build on the clean node-postgres path**

Run: `npm.cmd run build` with the configured production `DATABASE_URL` or the existing clean temporary node-postgres selection used by this repository.

Expected: compilation, type checking, and static generation succeed without the known PGlite Node 24 worker noise.

- [ ] **Step 5: Update operations documentation**

Document the daily scheduler command, no-op behavior, status endpoint, rollback guarantee, and the distinction between official snapshots and future correction overlays.

- [ ] **Step 6: Commit**

```powershell
git add src/data/catalog-fallback.json README.md
git commit -m "docs: document bulletin synchronization operations"
```

---

## Backend Plan Self-review Checklist

- Every approved backend requirement maps to a task.
- Every parser/publication behavior has a failing test before implementation.
- Network tests are limited to the explicit final real-source verification; unit tests use authored fixtures.
- Snapshot publication is atomic and retains the prior version on failure.
- Albert connectivity work is excluded.
- No task uses hard-coded observed major/subject counts as source truth.
- Dynamic programs cross the catalog/provider boundary for the frontend plan.
- Expected grades, selected credits, fulfillment facts, active-plan uniqueness, provider gating, paid endpoint authorization, deletion guards, and feasibility wording are covered.
