import {
  and,
  asc,
  eq,
  gt,
  ilike,
  inArray,
  lte,
  gte,
  or,
  sql,
} from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  getActiveCatalogRelease,
  getActiveReleaseCatalog,
  getCatalogSourceStatuses,
  type CatalogDb,
} from "@/lib/catalogRepository";
import {
  CatalogBootstrapResponseSchema,
  CatalogCourseBatchResponseSchema,
  CatalogCoursePageSchema,
  decodeCatalogCursor,
  encodeCatalogCursor,
  type CatalogBootstrapResponse,
  type CatalogCourseBatchResponse,
  type CatalogCoursePage,
  type CatalogCourseQuery,
} from "@/lib/catalog/contracts";
import { CatalogCourseRecordSchema, type CatalogCourseRecord } from "@/lib/catalog/types";
import { CATALOG_SOURCES } from "@/lib/bulletin/sourceRegistry";
import { getActiveRules } from "@/lib/repository";
import sitesJson from "@/data/sites.json";
import { applyCourseOverlays } from "@/lib/corrections/overlays";

export class CatalogUnavailableError extends Error {
  constructor() {
    super("No active catalog release is available.");
    this.name = "CatalogUnavailableError";
  }
}

async function activeMembership(db: CatalogDb) {
  const release = await getActiveCatalogRelease(db);
  if (!release) throw new CatalogUnavailableError();
  return { release, snapshotIds: Object.values(release.sourceSnapshotIds) };
}

async function activeOverlays(db: CatalogDb) {
  return db.select().from(schema.catalogOverlay).where(eq(schema.catalogOverlay.status, "active"));
}

function escapedLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export async function searchCatalogCourses(
  db: CatalogDb,
  query: CatalogCourseQuery,
): Promise<CatalogCoursePage> {
  const { release, snapshotIds } = await activeMembership(db);
  const predicates = [inArray(schema.catalogCourse.snapshotId, snapshotIds)];
  // Every word of the query must appear somewhere in the search text, so
  // "intro data science" matches regardless of word order.
  const phrase = query.q.trim();
  const terms = phrase.split(/\s+/).filter(Boolean).slice(0, 6);
  for (const term of terms) {
    predicates.push(ilike(schema.catalogCourse.searchText, `%${escapedLike(term)}%`));
  }
  // Relevance: exact code, then code prefix, then title prefix, then title
  // substring, then matches elsewhere (subject/description). Alphabetical
  // order within each tier keeps the cursor deterministic.
  const escapedPhrase = escapedLike(phrase);
  const rankExpression = terms.length
    ? sql<number>`case
        when ${schema.catalogCourse.code} ilike ${escapedPhrase} then 0
        when ${schema.catalogCourse.code} ilike ${`${escapedPhrase}%`} then 1
        when ${schema.catalogCourse.title} ilike ${`${escapedPhrase}%`} then 2
        when ${schema.catalogCourse.title} ilike ${`%${escapedPhrase}%`} then 3
        else 4 end`
    : sql<number>`0`;
  if (query.sourceIds.length) predicates.push(inArray(schema.catalogCourse.sourceId, query.sourceIds));
  if (query.subjects.length) predicates.push(inArray(schema.catalogCourse.subject, query.subjects));
  if (query.levels.length) predicates.push(inArray(schema.catalogCourse.level, query.levels));
  if (query.campuses.length) {
    const sourceIds = CATALOG_SOURCES.filter((source) => query.campuses.includes(source.campus)).map((source) => source.id);
    predicates.push(inArray(schema.catalogCourse.sourceId, sourceIds));
  }
  if (query.minCredits !== undefined) predicates.push(gte(schema.catalogCourse.maxCredits, query.minCredits));
  if (query.maxCredits !== undefined) predicates.push(lte(schema.catalogCourse.minCredits, query.maxCredits));
  if (query.catalogTerms.length) {
    predicates.push(sql`${schema.catalogCourse.catalogOfferingTerms} ?| array[${sql.join(query.catalogTerms.map((term) => sql`${term}`), sql`, `)}]`);
  }
  if (query.crossListed !== undefined) {
    predicates.push(
      query.crossListed
        ? sql`jsonb_array_length(${schema.catalogCourse.data}->'crossListedStableIds') > 0`
        : sql`jsonb_array_length(${schema.catalogCourse.data}->'crossListedStableIds') = 0`,
    );
  }
  if (query.fulfillsProgramId) {
    predicates.push(sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${schema.catalogCourse.data}->'course'->'fulfills') AS fulfillment WHERE fulfillment->>'programId' = ${query.fulfillsProgramId})`);
  }
  if (query.cursor) {
    const cursor = decodeCatalogCursor(query.cursor, release.id);
    predicates.push(
      or(
        sql`${rankExpression} > ${cursor.rank}`,
        and(
          sql`${rankExpression} = ${cursor.rank}`,
          or(
            gt(schema.catalogCourse.code, cursor.code),
            and(eq(schema.catalogCourse.code, cursor.code), gt(schema.catalogCourse.stableId, cursor.stableId)),
          )!,
        )!,
      )!,
    );
  }
  const rows = await db
    .select({ data: schema.catalogCourse.data, rank: rankExpression.as("search_rank") })
    .from(schema.catalogCourse)
    .where(and(...predicates))
    .orderBy(sql`search_rank`, asc(schema.catalogCourse.code), asc(schema.catalogCourse.stableId))
    .limit(query.limit + 1);
  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);
  const overlays = await activeOverlays(db);
  const items = page.map((row) => applyCourseOverlays(CatalogCourseRecordSchema.parse(row.data), overlays).value);
  const last = items.at(-1);
  const lastRank = page.at(-1)?.rank;
  return CatalogCoursePageSchema.parse({
    releaseId: release.id,
    items,
    nextCursor:
      hasMore && last
        ? encodeCatalogCursor({
            releaseId: release.id,
            code: last.code,
            stableId: last.stableId,
            rank: Number(lastRank ?? 0),
          })
        : null,
    totalApproximate: null,
  });
}

export async function readCatalogCourse(
  db: CatalogDb,
  stableId: string,
): Promise<CatalogCourseRecord | null> {
  const { snapshotIds } = await activeMembership(db);
  const [row] = await db
    .select({ data: schema.catalogCourse.data })
    .from(schema.catalogCourse)
    .where(and(inArray(schema.catalogCourse.snapshotId, snapshotIds), eq(schema.catalogCourse.stableId, stableId)))
    .limit(1);
  if (!row) return null;
  return applyCourseOverlays(CatalogCourseRecordSchema.parse(row.data), await activeOverlays(db)).value;
}

export async function readCatalogCourseBatch(
  db: CatalogDb,
  stableIds: string[],
): Promise<CatalogCourseBatchResponse> {
  const { release, snapshotIds } = await activeMembership(db);
  const requested = [...new Set(stableIds)].slice(0, 100);
  const rows = requested.length
    ? await db
        .select({ stableId: schema.catalogCourse.stableId, data: schema.catalogCourse.data })
        .from(schema.catalogCourse)
        .where(and(inArray(schema.catalogCourse.snapshotId, snapshotIds), inArray(schema.catalogCourse.stableId, requested)))
    : [];
  const overlays = await activeOverlays(db);
  const byId = new Map(rows.map((row) => [row.stableId, applyCourseOverlays(CatalogCourseRecordSchema.parse(row.data), overlays).value]));
  return CatalogCourseBatchResponseSchema.parse({
    releaseId: release.id,
    items: requested.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
    missingStableIds: requested.filter((id) => !byId.has(id)),
  });
}

export async function readCatalogBootstrap(db: CatalogDb): Promise<CatalogBootstrapResponse> {
  const [{ release, programs }, rules, statuses] = await Promise.all([
    getActiveReleaseCatalog(db).then((catalog) => {
      if (!catalog) throw new CatalogUnavailableError();
      return catalog;
    }),
    getActiveRules(db),
    getCatalogSourceStatuses(db),
  ]);
  const snapshotIds = Object.values(release.sourceSnapshotIds);
  const metadata = await db
    .select({
      sourceId: schema.catalogCourse.sourceId,
      subject: schema.catalogCourse.subject,
      minCredits: schema.catalogCourse.minCredits,
      maxCredits: schema.catalogCourse.maxCredits,
      terms: schema.catalogCourse.catalogOfferingTerms,
    })
    .from(schema.catalogCourse)
    .where(inArray(schema.catalogCourse.snapshotId, snapshotIds));
  const sourceCounts = new Map<string, number>();
  const subjectCounts = new Map<string, number>();
  const terms = new Set<string>();
  let minCredits = Number.POSITIVE_INFINITY;
  let maxCredits = 0;
  metadata.forEach((row) => {
    sourceCounts.set(row.sourceId, (sourceCounts.get(row.sourceId) ?? 0) + 1);
    subjectCounts.set(row.subject, (subjectCounts.get(row.subject) ?? 0) + 1);
    row.terms.forEach((term) => terms.add(term));
    minCredits = Math.min(minCredits, row.minCredits);
    maxCredits = Math.max(maxCredits, row.maxCredits);
  });
  const statusById = new Map(statuses.map((status) => [status.sourceId, status]));
  return CatalogBootstrapResponseSchema.parse({
    release,
    programs,
    rules,
    sources: CATALOG_SOURCES.filter((source) => release.sourceSnapshotIds[source.id]).map((source) => ({
      id: source.id,
      schoolName: source.schoolName,
      campus: source.campus,
      courseCount: sourceCounts.get(source.id) ?? 0,
      status: statusById.get(source.id)?.lastFailure ? "failed-with-last-known-good" : "healthy",
    })),
    sites: sitesJson,
    filters: {
      subjects: [...subjectCounts].sort(([a], [b]) => a.localeCompare(b)).map(([subject, courseCount]) => ({ subject, courseCount })),
      catalogTerms: [...terms].sort(),
      creditBounds: [Number.isFinite(minCredits) ? minCredits : 0, maxCredits],
    },
  });
}
