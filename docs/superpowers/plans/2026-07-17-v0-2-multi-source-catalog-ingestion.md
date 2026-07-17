# Multi-Source Bulletin Catalog Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the trusted catalog from one NYU Shanghai Bulletin snapshot to independently refreshable Shanghai and 13 New York undergraduate school sources, while keeping NYUSH program requirements authoritative and preserving a last-known-good catalog when any source fails.

**Architecture:** Each Bulletin section has a typed source definition and produces an immutable source snapshot. Valid source snapshots are composed into one immutable catalog release; only the release pointer is global. Course records gain a source-scoped stable ID while retaining the official course code consumed by existing degree engines. New York adapters ingest course inventory only, quarantine records whose undergraduate status is ambiguous, and never infer term availability, eligibility, or NYUSH fulfillment.

**Tech Stack:** Next.js 16.2.9, TypeScript 5, Zod 4, Cheerio, Drizzle ORM, PostgreSQL/PGlite, Vitest 4, tsx.

## Global Constraints

- Execute this plan before the query API, Program Profile, Correction Hub, Academic Glass, and release-integration plans.
- Read the relevant guides in `node_modules/next/dist/docs/` before changing Next.js code; route handlers remain request-time unless an extracted helper has explicit cache and invalidation semantics.
- Keep the product an NYUSH degree planner. Only `nyu-shanghai` may emit executable Core, major, or minor requirements.
- Treat New York Bulletin records as study-away catalog inventory. Never infer semester offering, seats, registration eligibility, prerequisites satisfied, or NYUSH degree fulfillment.
- Do not use the central A-Z course index as an allowlist because it mixes campuses and levels.
- Publish Bulletin data automatically only after per-source validation. A failed or anomalous refresh must preserve the previous healthy snapshot for that source.
- Keep immutable raw source documents, normalized source snapshots, composed releases, and later reviewed overlays as separate layers.
- Keep `Course.id` equal to the official code for deterministic-engine compatibility. Use `CatalogCourseRecord.stableId` for database, URL, cache, search, and placement identity.
- Preserve unresolved cross-source prerequisite and cross-list references as evidence; do not silently discard or mark them satisfied.
- Use single-agent execution unless the user explicitly changes that preference.
- Follow red-green-refactor. Observe each new test fail for the expected reason before implementation.
- Preserve unrelated working-tree changes and stage only the files owned by the current task.

---

## File Structure

### New catalog domain files

- `src/lib/catalog/types.ts` - source, stable record, source snapshot, and composed release contracts.
- `src/lib/catalog/identity.ts` - canonical code and source-scoped stable-ID helpers.
- `src/lib/catalog/identity.test.ts` - stable-identity tests.
- `src/lib/bulletin/sourceRegistry.ts` - Shanghai plus 13 New York school definitions.
- `src/lib/bulletin/sourceRegistry.test.ts` - exact registry and URL-boundary tests.
- `src/lib/bulletin/classifyCourse.ts` - undergraduate/graduate/ambiguous classifier.
- `src/lib/bulletin/classifyCourse.test.ts` - level-boundary tests.
- `src/lib/bulletin/__fixtures__/new-york/<source>/course-index.html` - one school index fixture per New York source.
- `src/lib/bulletin/__fixtures__/new-york/<source>/subject-page.html` - one representative course fixture per New York source.
- `src/lib/bulletin/syncAll.ts` - bounded multi-source orchestration and release composition.
- `src/lib/bulletin/syncAll.test.ts` - partial failure and last-known-good tests.

### Persistence changes

- `src/db/schema.ts` - source registry, source snapshots, searchable course columns, catalog releases, and release membership.
- `drizzle/0004_multi_source_catalog.sql` - generated and reviewed migration.
- `drizzle/meta/0004_snapshot.json` - generated Drizzle metadata.
- `drizzle/meta/_journal.json` - generated journal entry.
- `src/lib/catalogRepository.ts` - per-source publication and release composition.
- `src/lib/catalogRepository.test.ts` - transactional source/release tests.

### Existing Bulletin and delivery files changed

- `src/lib/bulletin/constants.ts`
- `src/lib/bulletin/sourceTypes.ts`
- `src/lib/bulletin/discover.ts`
- `src/lib/bulletin/discover.test.ts`
- `src/lib/bulletin/parseCoursePage.ts`
- `src/lib/bulletin/parseCoursePage.test.ts`
- `src/lib/bulletin/normalize.ts`
- `src/lib/bulletin/normalize.test.ts`
- `src/lib/bulletin/validateSnapshot.ts`
- `src/lib/bulletin/validateSnapshot.test.ts`
- `src/lib/bulletin/sync.ts`
- `src/lib/bulletin/sync.test.ts`
- `src/lib/types.ts`
- `src/lib/data.ts`
- `src/lib/repository.ts`
- `src/app/api/catalog/route.ts`
- `src/app/api/admin/bulletin/status/route.ts`
- `src/app/api/admin/bulletin/sync/route.ts`
- `scripts/sync-bulletin.ts`
- `scripts/generate-catalog-fallback.ts`
- `package.json`
- `README.md`

---

### Task 1: Add source-scoped catalog identity and the exact source registry

**Files:**
- Create: `src/lib/catalog/types.ts`
- Create: `src/lib/catalog/identity.ts`
- Create: `src/lib/catalog/identity.test.ts`
- Create: `src/lib/bulletin/sourceRegistry.ts`
- Create: `src/lib/bulletin/sourceRegistry.test.ts`
- Modify: `src/lib/types.ts`

**Interfaces:**

```ts
export type CatalogCampus = "shanghai" | "new-york";

export interface CatalogSourceDefinition {
  id: string;
  schoolName: string;
  campus: CatalogCampus;
  bulletinRoot: string;
  courseIndexUrl: string;
  includePrograms: boolean;
  enabled: boolean;
}

export interface CatalogCourseRecord {
  stableId: string;
  sourceId: string;
  sourceSnapshotId: string;
  code: string;
  subject: string;
  level: "undergraduate" | "graduate" | "ambiguous";
  catalogOfferingTerms: string[];
  catalogOfferingText: string | null;
  course: Course;
  crossListedStableIds: string[];
}

export interface CatalogReleaseRef {
  id: string;
  sourceSnapshotIds: Record<string, string>;
  publishedAt: string;
}

export type CatalogProgramAuditAuthority =
  | "nyush-bulletin"
  | "reviewed-nyush-overlay";

// Extend the existing CatalogProgram schema with:
export interface CatalogProgramAuthorityFields {
  auditAuthority: CatalogProgramAuditAuthority;
  eligibleProfileRoles: Array<"core" | "primaryMajor" | "secondMajor" | "minor">;
}
```

- [ ] **Step 1: Write failing stable-ID tests**

Create `src/lib/catalog/identity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canonicalCourseCode, catalogCourseStableId } from "@/lib/catalog/identity";

describe("catalog course identity", () => {
  it("normalizes whitespace and case in official codes", () => {
    expect(canonicalCourseCode("  csci-ua   101 ")).toBe("CSCI-UA 101");
  });

  it("keeps identical official codes distinct across sources", () => {
    expect(catalogCourseStableId("nyu-new-york-arts-science", "CSCI-UA 101"))
      .not.toBe(catalogCourseStableId("nyu-new-york-engineering", "CSCI-UA 101"));
  });
});
```

Run:

```powershell
npm.cmd test -- src/lib/catalog/identity.test.ts --maxWorkers=1
```

Expected: FAIL because `@/lib/catalog/identity` does not exist.

- [ ] **Step 2: Implement canonical official codes and stable IDs**

Create `src/lib/catalog/identity.ts`:

```ts
export function canonicalCourseCode(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function catalogCourseStableId(sourceId: string, code: string): string {
  const normalizedSource = sourceId.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(normalizedSource)) {
    throw new Error(`Invalid catalog source ID: ${sourceId}`);
  }
  return `${normalizedSource}:${canonicalCourseCode(code)}`;
}
```

Add strict Zod schemas and inferred types for the interfaces above in `src/lib/catalog/types.ts`. Extend the existing `CatalogProgramSchema` with the two authority fields, defaulting migrated Shanghai records to `nyush-bulletin` and roles derived from their program kind. Keep the existing `CourseSchema` unchanged except for adding optional source metadata needed by normalization; do not replace its official-code `id`.

- [ ] **Step 3: Write the exact failing registry test**

Create `src/lib/bulletin/sourceRegistry.test.ts` and assert that `CATALOG_SOURCES` contains exactly these enabled IDs in this order:

```ts
const EXPECTED_SOURCE_IDS = [
  "nyu-shanghai",
  "nyu-new-york-arts-science",
  "nyu-new-york-dentistry",
  "nyu-new-york-individualized-study",
  "nyu-new-york-business",
  "nyu-new-york-liberal-studies",
  "nyu-new-york-public-service",
  "nyu-new-york-nursing",
  "nyu-new-york-global-public-health",
  "nyu-new-york-professional-studies",
  "nyu-new-york-social-work",
  "nyu-new-york-culture-education-human-development",
  "nyu-new-york-engineering",
  "nyu-new-york-arts",
] as const;
```

Also assert that only `nyu-shanghai` has `includePrograms: true`, every New York root starts with `https://bulletins.nyu.edu/undergraduate/`, and every course index equals `${bulletinRoot}courses/`.

Run:

```powershell
npm.cmd test -- src/lib/bulletin/sourceRegistry.test.ts --maxWorkers=1
```

Expected: FAIL because the registry does not exist.

- [ ] **Step 4: Implement the registry**

Create `src/lib/bulletin/sourceRegistry.ts`. Use the current Shanghai root and these canonical New York roots:

```ts
const NEW_YORK_ROOTS = {
  "nyu-new-york-arts-science": "arts-science/",
  "nyu-new-york-dentistry": "dentistry/",
  "nyu-new-york-individualized-study": "individualized-study/",
  "nyu-new-york-business": "business/",
  "nyu-new-york-liberal-studies": "liberal-studies/",
  "nyu-new-york-public-service": "public-service/",
  "nyu-new-york-nursing": "nursing/",
  "nyu-new-york-global-public-health": "global-public-health/",
  "nyu-new-york-professional-studies": "professional-studies/",
  "nyu-new-york-social-work": "social-work/",
  "nyu-new-york-culture-education-human-development": "culture-education-human-development/",
  "nyu-new-york-engineering": "engineering/",
  "nyu-new-york-arts": "arts/",
} as const;
```

Use explicit school names in each record; do not derive user-facing names from slugs.

- [ ] **Step 5: Run focused tests and commit**

Run:

```powershell
npm.cmd test -- src/lib/catalog/identity.test.ts src/lib/bulletin/sourceRegistry.test.ts --maxWorkers=1
git add src/lib/catalog src/lib/bulletin/sourceRegistry.ts src/lib/bulletin/sourceRegistry.test.ts src/lib/types.ts
git commit -m "feat(catalog): define multi-source identity"
```

Expected: tests PASS; commit contains no scraper, schema, or UI changes.

---

### Task 2: Make Bulletin discovery source-aware without broadening the crawl boundary

**Files:**
- Modify: `src/lib/bulletin/constants.ts`
- Modify: `src/lib/bulletin/sourceTypes.ts`
- Modify: `src/lib/bulletin/discover.ts`
- Modify: `src/lib/bulletin/discover.test.ts`
- Create: `src/lib/bulletin/__fixtures__/new-york/arts-science/course-index.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/business/course-index.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/engineering/course-index.html`

**Interfaces:**

```ts
export interface BulletinDiscovery {
  sourceId: string;
  source: CatalogSourceDefinition;
  programUrls: string[];
  courseIndexUrls: string[];
  coursePageUrls: string[];
  discoveredUrls: string[];
}

export async function discoverBulletinSource(
  source: CatalogSourceDefinition,
  fetchPage: BulletinFetch,
): Promise<BulletinDiscovery>;
```

- [ ] **Step 1: Add failing discovery tests for Shanghai, CAS, Stern, and Tandon**

Extend `src/lib/bulletin/discover.test.ts` to prove:

- Shanghai still discovers programs and courses.
- CAS, Stern, and Tandon discover only pages under their own `bulletinRoot`.
- New York sources return `programUrls: []` even if the fixture links to a program page.
- Links to graduate, Shanghai, Abu Dhabi, or another school root are ignored.
- Fragments, query strings, duplicates, and non-HTTP links are removed deterministically.

Run:

```powershell
npm.cmd test -- src/lib/bulletin/discover.test.ts --maxWorkers=1
```

Expected: FAIL because discovery is hard-coded to Shanghai.

- [ ] **Step 2: Extend source-document metadata**

In `src/lib/bulletin/sourceTypes.ts`, add `sourceId`, `schoolName`, and `campus` to every discovered/fetched source-document schema. Keep existing Shanghai documents parseable by constructing these fields during discovery rather than making old fixture HTML encode them.

- [ ] **Step 3: Implement source-bounded URL acceptance**

Replace Shanghai-only path checks with:

```ts
export function belongsToSource(url: URL, source: CatalogSourceDefinition): boolean {
  const root = new URL(source.bulletinRoot);
  return url.origin === root.origin && url.pathname.startsWith(root.pathname);
}
```

The discovery function must receive a source definition. It may follow only source-root course index and course-detail links. It may follow program links only when `includePrograms` is true.

- [ ] **Step 4: Preserve the Shanghai compatibility entry point**

Keep the existing exported Shanghai discovery function as a thin adapter calling `discoverBulletinSource(getCatalogSource("nyu-shanghai"), fetchPage)`. This keeps the current sync runnable until Task 7 replaces orchestration.

- [ ] **Step 5: Run focused and regression tests, then commit**

Run:

```powershell
npm.cmd test -- src/lib/bulletin/discover.test.ts src/lib/bulletin/sourceRegistry.test.ts --maxWorkers=1
git add src/lib/bulletin/constants.ts src/lib/bulletin/sourceTypes.ts src/lib/bulletin/discover.ts src/lib/bulletin/discover.test.ts src/lib/bulletin/__fixtures__/new-york
git commit -m "feat(bulletin): discover configured sources"
```

Expected: PASS; no network request appears in tests.

---

### Task 3: Parse school-aware course detail metadata losslessly

**Files:**
- Modify: `src/lib/bulletin/sourceTypes.ts`
- Modify: `src/lib/bulletin/parseCoursePage.ts`
- Modify: `src/lib/bulletin/parseCoursePage.test.ts`
- Create: `src/lib/bulletin/__fixtures__/new-york/arts-science/subject-page.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/business/subject-page.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/engineering/subject-page.html`

**Interfaces:**

```ts
export interface SourceCourse {
  sourceId: string;
  schoolName: string;
  campus: CatalogCampus;
  code: string;
  title: string;
  creditText: string;
  description: string;
  prerequisiteText: string | null;
  offeringText: string | null;
  gradingText: string | null;
  repeatabilityText: string | null;
  levelText: string | null;
  crossListTexts: string[];
  attributes: string[];
  detailTexts: Record<string, string>;
  sourceUrl: string;
}
```

- [ ] **Step 1: Write failing parser fixtures and assertions**

Add representative authored CourseLeaf-shaped fixtures for CAS, Stern, and Tandon. Test fixed credit, variable credit, no credit text, prerequisites referencing another school, grading basis, repeatability, undergraduate/graduate labels, and cross-list text.

Run:

```powershell
npm.cmd test -- src/lib/bulletin/parseCoursePage.test.ts --maxWorkers=1
```

Expected: FAIL because the parser omits source/school and New York metadata.

- [ ] **Step 2: Replace Shanghai breadcrumb assumptions**

Change `parseCoursePage` to accept `{ source, sourceUrl, html }`. Derive source identity exclusively from the passed registry entry, never from user-controlled breadcrumb text. Keep title/code extraction tolerant of school-specific label order while retaining raw detail labels in `detailTexts`.

- [ ] **Step 3: Parse optional metadata without inventing semantics**

Normalize whitespace only. Preserve unknown labels in `detailTexts`; map known label aliases into the explicit fields above. Do not translate `Typically offered`, `Registration restriction`, or departmental consent into a guaranteed planner offering or eligibility flag.

- [ ] **Step 4: Preserve graduate codes embedded in undergraduate prerequisites**

Assert that a graduate-looking code mentioned inside `prerequisiteText` remains present as raw evidence. Course-level filtering belongs to Task 4 and must not edit narrative fields.

- [ ] **Step 5: Run parser regression and commit**

Run:

```powershell
npm.cmd test -- src/lib/bulletin/parseCoursePage.test.ts --maxWorkers=1
git add src/lib/bulletin/sourceTypes.ts src/lib/bulletin/parseCoursePage.ts src/lib/bulletin/parseCoursePage.test.ts src/lib/bulletin/__fixtures__/new-york
git commit -m "feat(bulletin): parse New York course metadata"
```

Expected: all Shanghai and New York parser tests PASS.

---

### Task 4: Classify undergraduate inventory and normalize stable records

**Files:**
- Create: `src/lib/bulletin/classifyCourse.ts`
- Create: `src/lib/bulletin/classifyCourse.test.ts`
- Modify: `src/lib/bulletin/normalize.ts`
- Modify: `src/lib/bulletin/normalize.test.ts`
- Modify: `src/lib/bulletin/validateSnapshot.ts`
- Modify: `src/lib/bulletin/validateSnapshot.test.ts`

**Interfaces:**

```ts
export type CourseLevelDecision =
  | { level: "undergraduate"; reason: string }
  | { level: "graduate"; reason: string }
  | { level: "ambiguous"; reason: string };

export function classifyCourseLevel(course: SourceCourse): CourseLevelDecision;

export interface SourceCatalogCandidate {
  sourceId: string;
  snapshotId: string;
  sourceHash: string;
  documents: SourceDocument[];
  courses: CatalogCourseRecord[];
  programs: CatalogProgram[];
  quarantinedCourses: Array<{ code: string; reason: string; sourceUrl: string }>;
  sourceReferenceIds: string[];
  unresolvedCourseIds: string[];
}
```

- [ ] **Step 1: Write failing level-classification tests**

Cover explicit undergraduate and graduate labels first, then documented school code conventions, then ambiguous records. Assert that ambiguous is never treated as undergraduate and that narrative prerequisites do not affect the containing course's level.

Run:

```powershell
npm.cmd test -- src/lib/bulletin/classifyCourse.test.ts --maxWorkers=1
```

Expected: FAIL because the classifier does not exist.

- [ ] **Step 2: Implement a conservative ordered classifier**

The implementation order must be:

1. explicit Bulletin level metadata;
2. source-specific tested code rule;
3. ambiguous quarantine.

Return a reason string for diagnostics. Do not use course title keywords as a decisive classifier.

- [ ] **Step 3: Write failing source-normalization tests**

Prove that New York normalization:

- emits `sites: ["new-york"]`, no programs, no automatic `fulfills` values, and `offeringKnown: false`;
- sets `stableId` from source plus official code but leaves `course.id` as the official code;
- retains variable-credit bounds, description, prerequisites, source URL, attributes, and cross-list evidence;
- retains Bulletin-published offering text/terms as catalog metadata on the wrapper while leaving `course.offeringKnown: false` for New York;
- excludes graduate records and quarantines ambiguous records;
- does not collide when two sources expose the same official code.
- labels every Shanghai program `auditAuthority: "nyush-bulletin"` with explicit eligible profile roles, while New York normalization emits no program record at all.

- [ ] **Step 4: Implement source-aware normalization**

Change normalization to accept a `BulletinDiscovery`/source definition. Keep the Shanghai program normalizer intact. Create one `CatalogCourseRecord` per accepted course and set provenance to its own source snapshot. Resolve cross-lists only when a source plus official-code target is unambiguous; otherwise preserve the raw reference in attributes/evidence.

- [ ] **Step 5: Add source validation gates**

Extend validation diagnostics with:

```ts
type MultiSourceValidationCode =
  | ExistingValidationCode
  | "source-id-mismatch"
  | "stable-id-mismatch"
  | "unexpected-program-source"
  | "graduate-record-included"
  | "ambiguous-record-included"
  | "course-count-drop"
  | "unresolved-reference-spike"
  | "zero-subjects"
  | "missing-course-code"
  | "missing-credit-value"
  | "invalid-canonical-url"
  | "structural-selector-miss";
```

Fail publication when a New York candidate contains programs, graduate/ambiguous records, mismatched stable IDs, zero subjects/courses, required field gaps, invalid canonical URLs, a structural selector miss disguised as an empty result, or unexplained course-count/unresolved-reference changes beyond the configured per-source anomaly thresholds. Record faithful unknown offering/external-reference metadata and quarantined counts as warnings, not silent omissions.

- [ ] **Step 6: Run focused tests and commit**

Run:

```powershell
npm.cmd test -- src/lib/bulletin/classifyCourse.test.ts src/lib/bulletin/normalize.test.ts src/lib/bulletin/validateSnapshot.test.ts --maxWorkers=1
git add src/lib/bulletin/classifyCourse.ts src/lib/bulletin/classifyCourse.test.ts src/lib/bulletin/normalize.ts src/lib/bulletin/normalize.test.ts src/lib/bulletin/validateSnapshot.ts src/lib/bulletin/validateSnapshot.test.ts
git commit -m "feat(catalog): normalize undergraduate source records"
```

Expected: PASS, including the existing Shanghai requirements fixtures.

---

### Task 5: Migrate persistence from one global snapshot to source snapshots and composed releases

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/lib/catalogRepository.ts`
- Modify: `src/lib/catalogRepository.test.ts`
- Create: `drizzle/0004_multi_source_catalog.sql`
- Create: `drizzle/meta/0004_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Schema contract:**

```text
catalogSource(id PK, schoolName, campus, bulletinRoot, enabled, createdAt, updatedAt)
catalogSnapshot(id PK, sourceId FK, sourceHash, status, validationReport,
  documentCount, courseCount, programCount, quarantinedCount, startedAt, completedAt)
catalogCourse(snapshotId FK, stableId, sourceId, code, subject, title,
  minCredits, maxCredits, level, catalogOfferingTerms, searchText, data,
  PK(snapshotId, stableId))
catalogProgram(snapshotId FK, programId, data, PK(snapshotId, programId))
catalogRelease(id PK, status, sourceSnapshotIds, publishedAt, createdAt)
catalogReleaseSource(releaseId FK, sourceId FK, snapshotId FK,
  PK(releaseId, sourceId))
```

- [ ] **Step 1: Write failing repository scenarios**

Extend `src/lib/catalogRepository.test.ts` with PGlite scenarios that assert:

- one active/healthy snapshot is allowed per source, not globally;
- publishing Stern does not retire Shanghai;
- a release references exactly one healthy snapshot for every enabled source;
- composition is rejected when a requested snapshot is failed or belongs to another source;
- a failed Tandon candidate preserves the previous Tandon snapshot and current release;
- a no-op source hash reuses the existing healthy snapshot;
- the migration preserves the existing active Shanghai catalog as source `nyu-shanghai` and creates an active release for it.

Run:

```powershell
npm.cmd test -- src/lib/catalogRepository.test.ts --maxWorkers=1
```

Expected: FAIL against the one-global-active schema.

- [ ] **Step 2: Modify the Drizzle schema**

Add the tables/columns above. Replace `catalog_snapshot_one_active` with a partial unique index on `(sourceId)` where status is `active`. Add one partial unique active-release index. Add indexes on course `(sourceId, subject, code, stableId)`, `(snapshotId, stableId)`, and release membership.

Do not delete the legacy mutable `course` table in v0.2; it still backs planner-owned custom/admin data until a later consolidation.

- [ ] **Step 3: Generate the ordered migration**

Run:

```powershell
npm.cmd run db:generate -- --name multi_source_catalog
```

Expected: Drizzle creates migration `0004_multi_source_catalog.sql` and its metadata. If the generated ordinal differs because another approved migration landed, keep the generated ordinal and update all later plan references before execution.

- [ ] **Step 4: Review and complete the data migration**

The SQL must:

1. seed the `nyu-shanghai` catalog source;
2. add nullable `sourceId`, backfill existing snapshots to `nyu-shanghai`, then make it non-null;
3. backfill course stable IDs as `nyu-shanghai:<official code>` and flat query columns from existing rows;
4. replace the global-active index with per-source active uniqueness;
5. create one active release from the existing active Shanghai snapshot when present;
6. preserve all source documents, programs, hashes, validation reports, and timestamps.

Do not hand-edit generated metadata JSON. Hand-edit the SQL only for safe backfill statements that Drizzle cannot infer.

- [ ] **Step 5: Implement transactional repository operations**

Expose these operations from `src/lib/catalogRepository.ts`:

```ts
publishSourceCandidate(db, candidate, report): Promise<SourcePublicationResult>;
composeCatalogRelease(db, sourceSnapshotIds): Promise<CatalogReleaseRef>;
getActiveCatalogRelease(db): Promise<ActiveCatalogRelease | null>;
getCatalogSourceStatuses(db): Promise<CatalogSourceStatus[]>;
```

`publishSourceCandidate` updates only that source. `composeCatalogRelease` inserts release membership and flips the active release in one transaction. Reader queries must join through active release membership; they must never union every active source snapshot implicitly.

- [ ] **Step 6: Run migration and repository tests**

Run:

```powershell
npm.cmd test -- src/lib/catalogRepository.test.ts --maxWorkers=1
```

Expected: PASS; the migration applies from `0000` through `0004` on a fresh PGlite database and the backfill scenario passes.

- [ ] **Step 7: Commit the persistence boundary**

```powershell
git add src/db/schema.ts src/lib/catalogRepository.ts src/lib/catalogRepository.test.ts drizzle
git commit -m "feat(catalog): compose source snapshots into releases"
```

Expected: one schema/repository commit; no UI files staged.

---

### Task 6: Add all 13 school adapter fixtures and validation coverage

**Files:**
- Create: `src/lib/bulletin/__fixtures__/new-york/dentistry/course-index.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/dentistry/subject-page.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/individualized-study/course-index.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/individualized-study/subject-page.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/liberal-studies/course-index.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/liberal-studies/subject-page.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/public-service/course-index.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/public-service/subject-page.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/nursing/course-index.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/nursing/subject-page.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/global-public-health/course-index.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/global-public-health/subject-page.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/professional-studies/course-index.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/professional-studies/subject-page.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/social-work/course-index.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/social-work/subject-page.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/culture-education-human-development/course-index.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/culture-education-human-development/subject-page.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/arts/course-index.html`
- Create: `src/lib/bulletin/__fixtures__/new-york/arts/subject-page.html`
- Create: `src/lib/bulletin/schoolAdapters.test.ts`

- [ ] **Step 1: Build the parameterized failing adapter matrix**

Create `src/lib/bulletin/schoolAdapters.test.ts`. For every New York source, load its two fixture files and assert discovery, parsing, undergraduate classification, stable ID generation, non-empty description when present, credit bounds, source provenance, zero programs, and `sites: ["new-york"]`.

Run:

```powershell
npm.cmd test -- src/lib/bulletin/schoolAdapters.test.ts --maxWorkers=1
```

Expected: FAIL listing the sources without fixtures or supported label patterns.

- [ ] **Step 2: Add minimal authored fixtures for the remaining ten schools**

Each fixture must contain only the smallest HTML necessary to represent that school's observed CourseLeaf labels and hierarchy. Do not store copied full Bulletin pages. Include at least one distinctive metadata pattern per school and one external/cross-list reference across the matrix.

- [ ] **Step 3: Extend aliases through data, not school-specific parser forks**

When a school uses a distinct detail label, add it to one label-alias map in `parseCoursePage.ts`. Add a source-specific level rule only in `classifyCourse.ts` and only when the fixture demonstrates it. Do not create 13 parser copies.

- [ ] **Step 4: Run the complete adapter matrix and commit**

Run:

```powershell
npm.cmd test -- src/lib/bulletin/schoolAdapters.test.ts src/lib/bulletin/parseCoursePage.test.ts src/lib/bulletin/normalize.test.ts --maxWorkers=1
git add src/lib/bulletin/__fixtures__/new-york src/lib/bulletin/schoolAdapters.test.ts src/lib/bulletin/parseCoursePage.ts src/lib/bulletin/classifyCourse.ts
git commit -m "test(bulletin): cover all New York school adapters"
```

Expected: every configured New York source appears exactly once in the passing matrix.

---

### Task 7: Orchestrate independent source refreshes and safe release composition

**Files:**
- Modify: `src/lib/bulletin/sync.ts`
- Modify: `src/lib/bulletin/sync.test.ts`
- Create: `src/lib/bulletin/syncAll.ts`
- Create: `src/lib/bulletin/syncAll.test.ts`

**Interfaces:**

```ts
export interface SourceSyncResult {
  sourceId: string;
  status: "published" | "unchanged" | "failed";
  snapshotId: string | null;
  retainedSnapshotId: string | null;
  diagnostics: string[];
}

export interface CatalogSyncResult {
  releaseId: string | null;
  sourceResults: SourceSyncResult[];
  complete: boolean;
}

export async function syncCatalogSources(options: {
  sourceIds?: string[];
  fetchPage: BulletinFetch;
  db: CatalogDb;
}): Promise<CatalogSyncResult>;
```

- [ ] **Step 1: Write failing orchestration tests**

Test all of these cases:

- a single-source refresh composes a new release using the new source snapshot plus last-known-good snapshots for untouched sources;
- a failed source retains its prior snapshot and does not block a release when a prior healthy snapshot exists;
- a failed source with no prior healthy snapshot leaves `complete: false` and does not activate an incomplete GA release;
- unchanged source hashes do not create snapshots or releases;
- the lock is source-scoped, so Shanghai and Stern may refresh concurrently but two Stern refreshes may not;
- results are returned in registry order for stable diagnostics.

- [ ] **Step 2: Refactor single-source sync**

Make `sync.ts` accept a source definition and return `SourceSyncResult`. Keep fetch concurrency bounded and retries unchanged. Replace the global advisory lock key with a deterministic source-specific key.

- [ ] **Step 3: Implement multi-source composition**

`syncCatalogSources` must synchronize selected sources, read healthy snapshots for unselected/failed sources, require full enabled-source coverage before a GA-complete release, and compose only when the membership map differs from the active release.

- [ ] **Step 4: Run sync and repository tests, then commit**

Run:

```powershell
npm.cmd test -- src/lib/bulletin/sync.test.ts src/lib/bulletin/syncAll.test.ts src/lib/catalogRepository.test.ts --maxWorkers=1
git add src/lib/bulletin/sync.ts src/lib/bulletin/sync.test.ts src/lib/bulletin/syncAll.ts src/lib/bulletin/syncAll.test.ts
git commit -m "feat(bulletin): refresh sources independently"
```

Expected: PASS; failure tests prove the active release remains readable.

---

### Task 8: Update CLI, admin diagnostics, and the compatibility catalog response

**Files:**
- Modify: `scripts/sync-bulletin.ts`
- Modify: `scripts/generate-catalog-fallback.ts`
- Modify: `src/app/api/admin/bulletin/status/route.ts`
- Modify: `src/app/api/admin/bulletin/sync/route.ts`
- Modify: `src/app/api/catalog/route.ts`
- Modify: `src/lib/data.ts`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/repository.test.ts`
- Modify: `package.json`
- Modify: `README.md`

**Compatibility response:**

```ts
interface BulletinCatalogResponse {
  release: CatalogReleaseRef;
  courses: CatalogCourseRecord[];
  programs: CatalogProgram[];
  rules: SpecialRule[];
}
```

The full-course response remains temporarily available in this plan so the existing UI stays functional. The query-driven plan removes that scaling bottleneck next.

- [ ] **Step 1: Write failing repository/response tests**

Prove that readers join only snapshots referenced by the active release, return stable records from all member sources, return programs only from Shanghai, and validate course provenance against `release.sourceSnapshotIds[course.sourceId]` rather than one global snapshot ID.

- [ ] **Step 2: Implement release-aware readers and schemas**

Update `src/lib/data.ts` and `src/lib/repository.ts`. Preserve the fallback path, but give fallback data a synthetic release with `nyu-shanghai` membership. Reject mixed or orphaned source snapshots.

- [ ] **Step 3: Add explicit CLI selection**

Support:

```powershell
npm.cmd run bulletin:sync
npm.cmd run bulletin:sync -- --source=nyu-new-york-arts-science
npm.cmd run bulletin:sync -- --source=nyu-new-york-business --source=nyu-new-york-engineering
```

Unknown or disabled source IDs must exit non-zero before fetching. Default execution refreshes all enabled sources and prints one row per source plus the composed release ID.

- [ ] **Step 4: Update admin status and sync contracts**

The status route returns active release membership plus per-source last-success, last-failure, counts, quarantined count, and retained snapshot. The sync route accepts a validated JSON body `{ sourceIds?: string[] }`. Keep `requireAdmin` as the only authorization boundary and return `409` for a locked source.

- [ ] **Step 5: Update fallback generation**

Generate a deterministic bootstrap-compatible fallback from the active release. Include Shanghai programs and the bounded metadata needed by the current UI, but do not embed all New York courses in the static application bundle. Until Plan 2 lands, database-backed production is required for the expanded New York catalog; document that temporary limitation.

- [ ] **Step 6: Run tests and static checks, then commit**

Run:

```powershell
npm.cmd test -- src/lib/repository.test.ts src/lib/data.test.ts --maxWorkers=1
npm.cmd run lint
npx.cmd tsc --noEmit
git add scripts src/app/api/admin/bulletin src/app/api/catalog/route.ts src/lib/data.ts src/lib/repository.ts src/lib/repository.test.ts package.json README.md
git commit -m "feat(catalog): expose composed Bulletin releases"
```

Expected: tests, lint, and typecheck PASS; the existing planner still loads through `/api/catalog`.

---

### Task 9: Verify the complete ingestion slice without publishing production data

**Files:**
- Modify only if a verification defect is found: files owned by Tasks 1-8.

- [ ] **Step 1: Run the full Bulletin and persistence suites**

```powershell
npm.cmd test -- src/lib/bulletin src/lib/catalogRepository.test.ts src/lib/repository.test.ts --maxWorkers=1
```

Expected: PASS with all 14 sources represented and no network access.

- [ ] **Step 2: Run the full repository gates**

```powershell
npm.cmd test -- --maxWorkers=1
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
```

Expected: all commands exit 0. The production build contains no route that treats New York programs as degree audits.

- [ ] **Step 3: Perform an offline migration rehearsal**

Create a disposable PGlite database through the existing migration-test harness, migrate through `0003`, insert the v0.1 Shanghai active-snapshot fixture, then migrate through `0004`. Assert row counts, hashes, active Shanghai membership, release membership, and course payload equality.

Expected: the v0.1 catalog remains readable with stable IDs after migration.

- [ ] **Step 4: Inspect policy strings and source coverage**

Run:

```powershell
rg -n "New York.*fulfill|offeringKnown:\s*true|includePrograms:\s*true" src/lib/bulletin src/lib/catalog
rg -n "nyu-new-york-" src/lib/bulletin/sourceRegistry.ts src/lib/bulletin/schoolAdapters.test.ts
```

Expected: no automatic New York fulfillment or known-offering assignment; all 13 New York IDs appear in registry and adapter coverage.

- [ ] **Step 5: Review commit scope**

```powershell
git status --short
git log --oneline -8
```

Expected: no uncommitted implementation files; commits correspond to the task boundaries above. Do not run a live Bulletin sync or publish production data in this verification task.

---

## Completion Criteria

- The source registry contains Shanghai plus exactly 13 enabled New York undergraduate school sources.
- Shanghai remains the only source of executable Core/major/minor program requirements.
- Every accepted New York course has a source-scoped stable ID, official code, school/campus provenance, and catalog-only availability semantics.
- Graduate records are excluded, ambiguous records are quarantined with diagnostics, and prerequisite text is preserved losslessly.
- Source snapshots publish independently; one failure retains its last-known-good snapshot and does not corrupt the active release.
- The v0.1 Shanghai snapshot migrates without data loss.
- Existing planner consumers remain functional until the next query-driven catalog plan replaces the temporary full response.
- Unit, migration, integration, lint, typecheck, and production-build gates pass.

## Handoff to the Next Plan

After this plan is complete, execute `2026-07-17-v0-2-query-catalog-discovery.md`. Do not begin Program Profile, Correction Hub, or visual-system work before the query contracts and normalized client cache are in place.
