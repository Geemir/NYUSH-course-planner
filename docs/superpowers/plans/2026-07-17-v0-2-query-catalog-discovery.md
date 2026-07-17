# Query-Driven Catalog Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the full-catalog browser payload with release-aware bootstrap metadata, paginated New York/Shanghai course search, stable course-detail and batch endpoints, and a normalized client cache that keeps placed courses available even when they are outside the visible search page.

**Architecture:** The server exposes a small bootstrap contract for programs, rules, sources, and filter metadata plus request-time course query/detail/batch routes backed by flat searchable columns from the active catalog release. The browser owns a bounded normalized cache keyed by source-scoped stable ID. Search pages, placed courses, detail targets, and prerequisite references hydrate that cache independently, while deterministic degree engines continue receiving official-code `Course` objects through an adapter.

**Tech Stack:** Next.js 16.2.9 App Router Route Handlers, React 19, TypeScript 5, Zod 4, Drizzle ORM, TanStack Virtual, Zustand, Vitest 4, React Testing Library.

## Global Constraints

- Execute after `2026-07-17-v0-2-multi-source-catalog-ingestion.md` and before Program Profile, Correction Hub, Academic Glass, and GA integration.
- Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `08-caching.md` before implementation.
- Database-backed catalog routes are request-time by default. Do not add `use cache` inside a route body or cache search responses without an explicit release-keyed invalidation design.
- Use stable IDs in API URLs, query result keys, client caches, and future placements. Keep official codes at the degree-engine boundary.
- The bootstrap response must not contain the complete New York catalog.
- Search results must never imply current offering, seats, registration eligibility, or degree fulfillment.
- Preserve access to placed/detail courses even when they are not present in the current query page or the app is temporarily offline.
- Keep search URL state shareable and keyboard accessible. Provide explicit loading, empty, error, stale, and load-more states.
- Do not add a new fetching dependency. Use typed fetch helpers, AbortController, and existing React/Zustand primitives.
- Follow red-green-refactor and stage only files owned by each task.

---

## File Structure

### New server contracts and repository

- `src/lib/catalog/contracts.ts` - bootstrap, query, page, detail, and batch schemas.
- `src/lib/catalog/contracts.test.ts` - parsing and cursor tests.
- `src/lib/catalog/searchRepository.ts` - active-release queries.
- `src/lib/catalog/searchRepository.test.ts` - PGlite search/pagination tests.
- `src/app/api/catalog/bootstrap/route.ts`
- `src/app/api/catalog/courses/route.ts`
- `src/app/api/catalog/courses/batch/route.ts`
- `src/app/api/catalog/courses/[stableId]/route.ts`

### New client data layer

- `src/lib/catalogClient.ts` - typed fetch functions and error mapping.
- `src/lib/catalogClient.test.ts`
- `src/lib/catalogCache.ts` - bounded normalized cache and persistence.
- `src/lib/catalogCache.test.ts`
- `src/hooks/useCatalogSearch.ts`
- `src/hooks/useCatalogSearch.test.tsx`

### Existing client and admin files changed

- `src/components/CatalogProvider.tsx`
- `src/components/CatalogProvider.test.tsx`
- `src/hooks/useCourseData.ts`
- `src/hooks/useCourseData.test.tsx`
- `src/components/catalog/CourseCatalog.tsx`
- `src/components/catalog/CourseCatalog.test.tsx`
- `src/components/dialogs/CourseDetailDialog.tsx`
- `src/components/dialogs/CourseDetailDialog.test.tsx`
- `src/components/PlannerApp.tsx`
- `src/components/admin/AdminCourses.tsx`
- `src/app/api/catalog/route.ts`
- `src/lib/data.ts`
- `src/lib/repository.ts`

---

### Task 1: Define bootstrap, query, page, detail, batch, and cursor contracts

**Files:**
- Create: `src/lib/catalog/contracts.ts`
- Create: `src/lib/catalog/contracts.test.ts`

**Interfaces:**

```ts
export const CatalogCourseQuerySchema = z.object({
  q: z.string().trim().max(120).default(""),
  campuses: z.array(z.enum(["shanghai", "new-york"])).max(2).default([]),
  sourceIds: z.array(z.string()).max(14).default([]),
  subjects: z.array(z.string()).max(30).default([]),
  levels: z.array(z.enum(["undergraduate"])).default(["undergraduate"]),
  catalogTerms: z.array(z.string().max(40)).max(12).default([]),
  minCredits: z.number().nonnegative().optional(),
  maxCredits: z.number().nonnegative().optional(),
  fulfillsProgramId: z.string().optional(),
  crossListed: z.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(40),
});

export interface CatalogBootstrapResponse {
  release: CatalogReleaseRef;
  programs: CatalogProgram[];
  rules: SpecialRule[];
  sources: CatalogSourceSummary[];
  sites: Site[];
  filters: {
    subjects: CatalogSubjectSummary[];
    catalogTerms: string[];
    creditBounds: [number, number];
  };
}

export interface CatalogCoursePage {
  releaseId: string;
  items: CatalogCourseRecord[];
  nextCursor: string | null;
  totalApproximate: number | null;
}

export interface CatalogCourseBatchRequest { stableIds: string[] }
export interface CatalogCourseBatchResponse {
  releaseId: string;
  items: CatalogCourseRecord[];
  missingStableIds: string[];
}
```

- [ ] **Step 1: Write failing strict-schema tests**

Test default query values, repeated URL parameters, maximum limits, whitespace trimming, unknown keys, invalid credit ranges, duplicate stable IDs, batch size cap of 100, and stable serialization of source/subject arrays.

Run:

```powershell
npm.cmd test -- src/lib/catalog/contracts.test.ts --maxWorkers=1
```

Expected: FAIL because the contracts module does not exist.

- [ ] **Step 2: Implement URL query parsing**

Export:

```ts
export function parseCatalogCourseSearchParams(params: URLSearchParams): CatalogCourseQuery;
export function catalogCourseQueryToSearchParams(query: CatalogCourseQuery): URLSearchParams;
```

Use repeated `campus`, `source`, `subject`, `level`, and `catalogTerm` parameters. Reject `minCredits > maxCredits` with a Zod issue. `catalogTerm` filters only the Bulletin's published catalog metadata; the contract and UI must not call it a current offering or schedule filter.

- [ ] **Step 3: Implement opaque stable cursors**

Cursor payload:

```ts
const CursorPayloadSchema = z.object({
  releaseId: z.string(),
  code: z.string(),
  stableId: z.string(),
});
```

Encode/decode as base64url JSON. Reject a cursor from another release so pagination cannot mix source versions.

- [ ] **Step 4: Add response schemas and round-trip tests**

Use the catalog domain schemas from Plan 1. Batch input must deduplicate IDs while preserving first-seen order. Course pages must be strict and bounded to 100 records.

- [ ] **Step 5: Run focused tests and commit**

```powershell
npm.cmd test -- src/lib/catalog/contracts.test.ts --maxWorkers=1
git add src/lib/catalog/contracts.ts src/lib/catalog/contracts.test.ts
git commit -m "feat(catalog): define query API contracts"
```

Expected: PASS.

---

### Task 2: Implement active-release search, detail, batch, and bootstrap queries

**Files:**
- Create: `src/lib/catalog/searchRepository.ts`
- Create: `src/lib/catalog/searchRepository.test.ts`
- Modify: `src/lib/catalogRepository.ts`

**Interfaces:**

```ts
export async function readCatalogBootstrap(db: CatalogDb): Promise<CatalogBootstrapResponse>;
export async function searchCatalogCourses(db: CatalogDb, query: CatalogCourseQuery): Promise<CatalogCoursePage>;
export async function readCatalogCourse(db: CatalogDb, stableId: string): Promise<CatalogCourseRecord | null>;
export async function readCatalogCourseBatch(db: CatalogDb, stableIds: string[]): Promise<CatalogCourseBatchResponse>;
```

- [ ] **Step 1: Seed a multi-source PGlite fixture and write failing tests**

Cover:

- search joins only snapshots in the active release;
- case-insensitive code/title/description search;
- source/site, subject, catalog-term metadata, credit, fulfillment-overlay-ready, and cross-list filters;
- deterministic `(code, stableId)` order and no duplicates across cursor pages;
- cursor rejection after active release changes;
- detail lookup cannot read a retired/non-member snapshot;
- batch preserves request order, reports missing IDs, and caps at 100;
- bootstrap contains programs/rules/source/filter metadata but no course array.

Run:

```powershell
npm.cmd test -- src/lib/catalog/searchRepository.test.ts --maxWorkers=1
```

Expected: FAIL because repository functions do not exist.

- [ ] **Step 2: Implement bounded text and filter queries**

Build predicates only from validated input. Use the flat `searchText`, source, subject, level, catalog offering terms, credits, and stable-ID columns added in Plan 1. Escape `%`, `_`, and `\\` in user text before an `ILIKE` pattern. Never interpolate raw query text into SQL.

- [ ] **Step 3: Implement keyset pagination**

For the next page, filter rows where `(code > cursor.code) OR (code = cursor.code AND stableId > cursor.stableId)`. Encode the last returned row with the active release ID. Fetch `limit + 1` to determine `nextCursor`.

- [ ] **Step 4: Implement bootstrap aggregates**

Read source counts, site metadata, catalog terms, and subjects only from active release membership. Return ordered sources in registry order and ordered subjects/terms by code/label. Include each source's healthy/stale/failed-with-last-known-good status. Keep `totalApproximate` null until a measured need justifies a count query on every search.

- [ ] **Step 5: Run repository tests and commit**

```powershell
npm.cmd test -- src/lib/catalog/searchRepository.test.ts src/lib/catalogRepository.test.ts --maxWorkers=1
git add src/lib/catalog/searchRepository.ts src/lib/catalog/searchRepository.test.ts src/lib/catalogRepository.ts
git commit -m "feat(catalog): query the active release"
```

Expected: PASS with no full-table result returned by bootstrap.

---

### Task 3: Add request-time catalog Route Handlers

**Files:**
- Create: `src/app/api/catalog/bootstrap/route.ts`
- Create: `src/app/api/catalog/courses/route.ts`
- Create: `src/app/api/catalog/courses/batch/route.ts`
- Create: `src/app/api/catalog/courses/[stableId]/route.ts`
- Create: `src/app/api/catalog/catalogRoutes.test.ts`

**HTTP contract:**

```text
GET  /api/catalog/bootstrap                -> 200 CatalogBootstrapResponse
GET  /api/catalog/courses?q=biology&limit=40 -> 200 CatalogCoursePage
POST /api/catalog/courses/batch            -> 200 CatalogCourseBatchResponse
GET  /api/catalog/courses/:stableId         -> 200 CatalogCourseRecord | 404
invalid query/body                          -> 400 { error, issues }
catalog unavailable                         -> 503 { error: "catalog_unavailable" }
```

- [ ] **Step 1: Write failing route contract tests**

Mock the extracted repository functions, then test parsing, status codes, JSON content type, cache headers, `404`, `400`, and `503`. Keep database behavior in Task 2 tests.

- [ ] **Step 2: Implement bootstrap and search routes**

Do not export `dynamic = "force-static"`. Add:

```ts
const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
} as const;
```

Use a common error serializer so invalid query details never include stack traces.

- [ ] **Step 3: Implement batch and async dynamic detail routes**

Use the Next.js 16 route context form:

```ts
export async function GET(
  _request: Request,
  context: RouteContext<"/api/catalog/courses/[stableId]">,
) {
  const { stableId } = await context.params;
  // decodeURIComponent is handled by routing; validate the decoded ID.
}
```

Validate stable ID length and format before repository access.

- [ ] **Step 4: Preserve the legacy endpoint until the client cutover**

Leave `/api/catalog` unchanged in this task so the existing client remains green while the new routes are introduced. Add a test proving the new route set does not alter the legacy response. Task 5 retires it in the same commit that removes the final client dependency.

- [ ] **Step 5: Run route tests, lint, typecheck, and commit**

```powershell
npm.cmd test -- src/app/api/catalog/catalogRoutes.test.ts --maxWorkers=1
npm.cmd run lint
npx.cmd tsc --noEmit
git add src/app/api/catalog
git commit -m "feat(api): expose paginated catalog routes"
```

Expected: PASS; route tests prove request-time/no-store behavior.

---

### Task 4: Build the typed client and bounded normalized course cache

**Files:**
- Create: `src/lib/catalogClient.ts`
- Create: `src/lib/catalogClient.test.ts`
- Create: `src/lib/catalogCache.ts`
- Create: `src/lib/catalogCache.test.ts`

**Interfaces:**

```ts
export interface CatalogCourseCacheState {
  releaseId: string | null;
  byStableId: Record<string, CatalogCourseRecord>;
  stableIdByOfficialCode: Record<string, string[]>;
  lastAccessedAt: Record<string, number>;
}

export interface CatalogClient {
  getBootstrap(signal?: AbortSignal): Promise<CatalogBootstrapResponse>;
  search(query: CatalogCourseQuery, signal?: AbortSignal): Promise<CatalogCoursePage>;
  getCourse(stableId: string, signal?: AbortSignal): Promise<CatalogCourseRecord>;
  getCourses(stableIds: string[], signal?: AbortSignal): Promise<CatalogCourseBatchResponse>;
}
```

- [ ] **Step 1: Write failing fetch-contract tests**

Mock `fetch` and assert URL serialization, JSON schema validation, AbortSignal propagation, typed `CatalogClientError` for 400/404/503/network/invalid JSON, and no retry loop on client validation errors.

- [ ] **Step 2: Implement typed client functions**

Parse every successful response with the schemas from Task 1. Map server errors into stable codes. Let callers decide when to retry; do not hide errors.

- [ ] **Step 3: Write failing cache tests**

Test release replacement, upsert, official-code lookup returning multiple stable IDs, LRU eviction, pinning placed/detail IDs, corrupt localStorage recovery, maximum persisted records, and stale offline reads.

- [ ] **Step 4: Implement the cache**

Use one versioned localStorage key, `nyush-catalog-course-cache-v2`. Cap persisted records at 500. Never evict IDs passed as pinned. When release ID changes, retain records only for pinned placements long enough to resolve/migrate them and mark them stale; clear unpinned search records.

- [ ] **Step 5: Run focused tests and commit**

```powershell
npm.cmd test -- src/lib/catalogClient.test.ts src/lib/catalogCache.test.ts --maxWorkers=1
git add src/lib/catalogClient.ts src/lib/catalogClient.test.ts src/lib/catalogCache.ts src/lib/catalogCache.test.ts
git commit -m "feat(catalog): add typed client cache"
```

Expected: PASS, including corrupt-storage recovery.

---

### Task 5: Refactor CatalogProvider and degree-engine adapters

**Files:**
- Modify: `src/components/CatalogProvider.tsx`
- Modify: `src/components/CatalogProvider.test.tsx`
- Modify: `src/hooks/useCourseData.ts`
- Create: `src/hooks/useCourseData.test.tsx`
- Modify: `src/lib/data.ts`
- Modify: `src/app/api/catalog/route.ts`

**Provider contract:**

```ts
interface CatalogContextValue {
  bootstrap: CatalogBootstrapResponse;
  recordsByStableId: ReadonlyMap<string, CatalogCourseRecord>;
  getRecord(stableId: string): CatalogCourseRecord | undefined;
  ensureCourses(stableIds: string[]): Promise<void>;
  upsertRecords(records: CatalogCourseRecord[]): void;
  status: "loading" | "ready" | "stale" | "error";
  error: CatalogClientError | null;
}
```

- [ ] **Step 1: Write failing provider tests**

Prove that the provider fetches only bootstrap on mount, hydrates cached records, batches missing pinned placement IDs, discards stale unpinned records after release change, surfaces offline/stale state, and never imports the bundled full catalog into the client bundle.

- [ ] **Step 2: Refactor provider ownership**

Replace the full course array with bootstrap plus a normalized record map. Expose stable callbacks with `useCallback`/`useMemo`. Abort in-flight bootstrap and batch fetches on unmount.

- [ ] **Step 3: Adapt `useCourseData` for official-code engines**

Return both:

```ts
{
  records: CatalogCourseRecord[];
  courses: Course[];
  courseByStableId: Map<string, Course>;
  coursesByOfficialCode: Map<string, Course[]>;
}
```

The engine-facing `courses` list uses `record.course` and retains custom courses. If multiple sources share an official code, do not select one silently; placement stable identity resolves the correct record.

- [ ] **Step 4: Remove full-fallback assumptions and retire `/api/catalog` atomically**

Keep a small bootstrap fallback for offline shell/program display. Course records come from the bounded cache, placed-plan snapshot backup, or API. Show a recoverable unavailable state when none exists. After the provider tests prove no caller needs the full response, change `/api/catalog` to a `308` redirect to `/api/catalog/bootstrap` and update its route test in this same commit.

- [ ] **Step 5: Run provider/hook tests and commit**

```powershell
npm.cmd test -- src/components/CatalogProvider.test.tsx src/hooks/useCourseData.test.tsx --maxWorkers=1
git add src/components/CatalogProvider.tsx src/components/CatalogProvider.test.tsx src/hooks/useCourseData.ts src/hooks/useCourseData.test.tsx src/lib/data.ts src/app/api/catalog/route.ts
git commit -m "refactor(catalog): normalize client course state"
```

Expected: PASS; build analysis no longer places the complete New York catalog in a client chunk.

---

### Task 6: Add cancellable search state and rebuild Course Catalog discovery

**Files:**
- Create: `src/hooks/useCatalogSearch.ts`
- Create: `src/hooks/useCatalogSearch.test.tsx`
- Modify: `src/components/catalog/CourseCatalog.tsx`
- Modify: `src/components/catalog/CourseCatalog.test.tsx`
- Modify: `src/components/PlannerApp.tsx`

**Hook contract:**

```ts
interface CatalogSearchState {
  query: CatalogCourseQuery;
  items: CatalogCourseRecord[];
  status: "idle" | "loading" | "loading-more" | "ready" | "empty" | "error";
  error: CatalogClientError | null;
  nextCursor: string | null;
  isStale: boolean;
  setQuery(patch: Partial<CatalogCourseQuery>): void;
  loadMore(): Promise<void>;
  retry(): Promise<void>;
}
```

- [ ] **Step 1: Write failing hook race-condition tests**

Use deferred promises to prove that a superseded search is aborted and cannot overwrite a newer result. Test load-more deduplication, release mismatch restart, URL-state initialization, retry, and offline cached results.

- [ ] **Step 2: Implement `useCatalogSearch`**

Debounce text input by 200 ms, but apply filters immediately. Abort the previous request on query change. Upsert results into `CatalogProvider`. Reset cursor when any filter other than cursor changes.

- [ ] **Step 3: Write failing Course Catalog interaction tests**

Cover search by code/title, campus/school/subject/catalog-term/credit/NYUSH-fulfillment filters, clear filters, loading skeleton, catalog-only New York label, empty state, retry, offline banner, stale or partial-source-health banner, load-more button, keyboard focus, and one course opening the detail dialog by stable ID.

- [ ] **Step 4: Rebuild `CourseCatalog` around server pages**

Keep local-only filters for custom/unplanned status after server results arrive. Preserve TanStack Virtual for the rendered page list. Use an accessible `Load more courses` button as the canonical pagination control; an intersection observer may activate it but cannot be the only mechanism.

Every New York card must show:

```text
New York study-away catalog
Availability and registration eligibility not confirmed
```

When a Bulletin publishes offering terms, label them `Bulletin catalog pattern` and repeat that they are not a current schedule. Do not display a current term-offered badge unless a later authoritative schedule source exists.

- [ ] **Step 5: Update `PlannerApp` stable detail selection**

Change dialog state from official code to stable ID. For legacy/custom courses without a stable ID, use a distinct custom-course detail branch rather than fabricating a Bulletin ID.

- [ ] **Step 6: Run component tests and commit**

```powershell
npm.cmd test -- src/hooks/useCatalogSearch.test.tsx src/components/catalog/CourseCatalog.test.tsx --maxWorkers=1
git add src/hooks/useCatalogSearch.ts src/hooks/useCatalogSearch.test.tsx src/components/catalog/CourseCatalog.tsx src/components/catalog/CourseCatalog.test.tsx src/components/PlannerApp.tsx
git commit -m "feat(catalog): add paginated study-away discovery"
```

Expected: PASS; searches do not require an all-courses client array.

---

### Task 7: Hydrate details, placements, prerequisites, and admin search by stable ID

**Files:**
- Modify: `src/components/dialogs/CourseDetailDialog.tsx`
- Create: `src/components/dialogs/CourseDetailDialog.test.tsx`
- Modify: `src/components/admin/AdminCourses.tsx`
- Create: `src/components/admin/AdminCourses.test.tsx`
- Modify: `src/components/CatalogProvider.tsx`
- Modify: `src/hooks/useCourseData.ts`

- [ ] **Step 1: Write failing detail hydration tests**

Assert that opening an uncached stable ID fetches one detail record, reopening uses cache, prerequisite stable IDs are batch fetched, closing aborts in-flight detail work, missing records show a recoverable state, and every trust signal renders: source school/campus, Bulletin/catalog year, canonical source URL, release publication time, catalog-only availability disclaimer, NYUSH fulfillment status/evidence, and an extension point for reviewed-overlay disclosure/reporting added in Plan 4.

- [ ] **Step 2: Implement detail and prerequisite hydration**

Fetch details by stable ID. Resolve prerequisite evidence through known stable links first; keep unresolved official-code references visible as text. Never mark a prerequisite satisfied merely because a matching code was fetched.

- [ ] **Step 3: Ensure placed courses are pinned and batch-loaded**

Whenever the plan placement list changes, collect non-custom `catalogCourseId` values, pin them in the cache, and call `ensureCourses` for missing records in batches of 100. Render a placeholder course chip with code/title from the plan snapshot until hydration completes.

- [ ] **Step 4: Move admin course lookup to the same query contracts**

Replace `AdminCourses` full-catalog load with server search and stable detail lookup. Keep manual course administration separate from immutable Bulletin records and label the source clearly.

- [ ] **Step 5: Run focused and full client tests, then commit**

```powershell
npm.cmd test -- src/components/dialogs/CourseDetailDialog.test.tsx src/components/admin/AdminCourses.test.tsx src/components/CatalogProvider.test.tsx --maxWorkers=1
npm.cmd test -- --maxWorkers=1
git add src/components/dialogs/CourseDetailDialog.tsx src/components/dialogs/CourseDetailDialog.test.tsx src/components/admin/AdminCourses.tsx src/components/admin/AdminCourses.test.tsx src/components/CatalogProvider.tsx src/hooks/useCourseData.ts
git commit -m "feat(catalog): hydrate planner courses on demand"
```

Expected: PASS; placed courses remain rendered outside the current search page.

---

### Task 8: Verify payload, pagination, offline, and accessibility behavior

**Files:**
- Modify only if a verification defect is found: files owned by Tasks 1-7.

- [ ] **Step 1: Run all catalog suites**

```powershell
npm.cmd test -- src/lib/catalog src/app/api/catalog src/components/CatalogProvider.test.tsx src/hooks/useCatalogSearch.test.tsx src/components/catalog/CourseCatalog.test.tsx src/components/dialogs/CourseDetailDialog.test.tsx --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 2: Run repository gates**

```powershell
npm.cmd test -- --maxWorkers=1
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
```

Expected: all exit 0.

- [ ] **Step 3: Inspect production output and network semantics**

Start the production server in a separate terminal after `build`, then inspect:

```powershell
curl.exe -i http://localhost:3000/api/catalog/bootstrap
curl.exe -i "http://localhost:3000/api/catalog/courses?q=computer&limit=2"
```

Expected: bootstrap has no `courses` array; search returns at most two records and a release-bound cursor; both responses have explicit request-time/private cache headers.

- [ ] **Step 4: Measure bounded client delivery**

Use build output and browser network inspection to confirm first load transfers bootstrap metadata plus the first course page only. Record the byte totals in the Plan 6 release report; do not set an unmeasured numeric budget in this plan.

- [ ] **Step 5: Keyboard and offline smoke check**

Verify search, filters, results, Load more, and detail close work by keyboard. After one search and one placed-course hydration, disable network and reload: cached placed courses must remain visible, search must be marked stale/offline, and no mutation is lost.

---

## Completion Criteria

- Initial bootstrap contains release, programs, rules, sources, and filters, but not the complete course inventory.
- Course search is release-aware, validated, paginated, bounded, and deterministic.
- Detail and batch lookups use stable IDs and cannot expose retired snapshots.
- The client cache is bounded, release-aware, corruption-tolerant, and pins placed/detail records.
- Deterministic degree engines still receive official-code `Course` objects without ambiguous source selection.
- Course Catalog exposes source filters and non-authoritative New York copy with complete loading/error/empty/offline behavior.
- Placed courses and prerequisites render independently of the visible search page.
- Unit, repository, route, component, lint, typecheck, build, keyboard, and offline checks pass.

## Handoff to the Next Plan

After this plan is complete, execute `2026-07-17-v0-2-program-profile-plan-safety.md`. Its plan-v2 migration depends on the stable course IDs and normalized cache defined here.
