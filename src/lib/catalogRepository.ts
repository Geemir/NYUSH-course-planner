import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { z } from "zod";
import * as schema from "@/db/schema";
import {
  assertPublishable,
  validateCatalogCandidate,
  type SnapshotValidationCode,
  type SnapshotValidationReport,
} from "@/lib/bulletin/validateSnapshot";
import {
  CatalogProgramSchema,
  CatalogCandidateSchema,
  CourseSchema,
  type CatalogProgram,
  type CatalogCandidate,
} from "@/lib/types";
import {
  CatalogCourseRecordSchema,
  CatalogReleaseRefSchema,
  type CatalogReleaseRef,
  type SourceCatalogCandidate,
} from "@/lib/catalog/types";
import { getCatalogSource } from "@/lib/bulletin/sourceRegistry";
import { applyCourseOverlays, applyProgramOverlays, reconcileCatalogOverlays } from "@/lib/corrections/overlays";

export type CatalogDb =
  | NodePgDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

export type CatalogSnapshotStatus =
  (typeof schema.catalogSnapshot.$inferSelect)["status"];

export interface CatalogStatusEntry {
  id: string;
  sourceHash: string;
  status: CatalogSnapshotStatus;
  validationReport: SnapshotValidationReport;
  documentCount: number;
  courseCount: number;
  programCount: number;
  failureSummary: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

export interface CatalogStatus {
  active: CatalogStatusEntry | null;
  recent: CatalogStatusEntry[];
}

const SNAPSHOT_VALIDATION_CODES = [
  "broken-executable-reference",
  "duplicate-course-id",
  "duplicate-program-id",
  "duplicate-source-id",
  "empty-catalog",
  "invalid-source-document",
  "manual-confirmation",
  "missing-discovered-page",
  "missing-fetched-page",
  "missing-title",
  "provenance-hash-mismatch",
  "provenance-source-mismatch",
  "snapshot-id-mismatch",
  "source-hash-mismatch",
  "source-row-coverage",
  "supported-ambiguity",
  "unresolved-local-reference",
  "source-id-mismatch",
  "stable-id-mismatch",
  "unexpected-program-source",
  "graduate-record-included",
  "ambiguous-record-included",
  "course-count-drop",
  "unresolved-reference-spike",
  "zero-subjects",
  "missing-course-code",
  "missing-credit-value",
  "invalid-canonical-url",
  "structural-selector-miss",
] as const satisfies readonly SnapshotValidationCode[];

const SnapshotValidationDiagnosticSchema = z
  .object({
    code: z.enum(SNAPSHOT_VALIDATION_CODES),
    sourceUrl: z.string().optional(),
    entityId: z.string().optional(),
  })
  .strict();

const SnapshotValidationReportSchema = z
  .object({
    summary: z
      .object({
        snapshotId: z.string(),
        sourceHash: z.string(),
        documentCount: z.number().int().nonnegative(),
        courseCount: z.number().int().nonnegative(),
        programCount: z.number().int().nonnegative(),
        sourceRowCount: z.number().int().nonnegative(),
        requirementRowCount: z.number().int().nonnegative(),
      })
      .strict(),
    errors: z.array(SnapshotValidationDiagnosticSchema),
    warnings: z.array(SnapshotValidationDiagnosticSchema),
  })
  .strict();

export class CatalogPublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogPublicationError";
  }
}

function sourceUrlOf(document: unknown): string {
  if (
    typeof document !== "object" ||
    document === null ||
    !("sourceUrl" in document) ||
    typeof document.sourceUrl !== "string" ||
    document.sourceUrl === ""
  ) {
    throw new CatalogPublicationError(
      "A validated catalog source document has no source URL.",
    );
  }
  return document.sourceUrl;
}

function persistedDocument(data: unknown): unknown {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw new CatalogPublicationError(
      "A persisted catalog source document is not valid JSON.",
    );
  }
}

function assertReportMatchesCandidate(
  candidate: CatalogCandidate,
  report: SnapshotValidationReport,
): void {
  const expected = {
    snapshotId: candidate.snapshotId,
    sourceHash: candidate.sourceHash,
    documentCount: candidate.documents.length,
    courseCount: candidate.courses.length,
    programCount: candidate.programs.length,
    sourceRowCount: candidate.programs.reduce(
      (count, program) => count + program.sourceRows.length,
      0,
    ),
    requirementRowCount: candidate.programs.reduce(
      (count, program) => count + program.requirementRows.length,
      0,
    ),
  };
  if (JSON.stringify(report.summary) !== JSON.stringify(expected)) {
    throw new CatalogPublicationError(
      "The validation report does not describe this catalog candidate.",
    );
  }
}

function snapshotValues(
  candidate: CatalogCandidate,
  report: SnapshotValidationReport,
) {
  return {
    id: candidate.snapshotId,
    sourceId: "nyu-shanghai",
    sourceHash: candidate.sourceHash,
    validationReport: report,
    documentCount: candidate.documents.length,
    courseCount: candidate.courses.length,
    programCount: candidate.programs.length,
    sourceReferenceIds: candidate.sourceReferenceIds,
    externalCourseIds: candidate.externalCourseIds,
    unresolvedCourseIds: candidate.unresolvedCourseIds,
  };
}

async function recordPrePublicationFailure(
  db: CatalogDb,
  candidate: CatalogCandidate,
  report: SnapshotValidationReport,
  error: unknown,
): Promise<void> {
  const now = new Date();
  const failureSummary =
    error instanceof Error ? error.message : "Catalog pre-publication failed.";
  await db
    .insert(schema.catalogSnapshot)
    .values({
      ...snapshotValues(candidate, report),
      status: "failed",
      failureSummary,
      completedAt: now,
    })
    .onConflictDoNothing();
}

/**
 * Persists and activates a fully validated candidate as one transaction.
 * Transaction failures deliberately leave no candidate snapshot row behind,
 * so readers continue to observe the previously active catalog unchanged.
 */
export async function publishCatalogCandidate(
  db: CatalogDb,
  candidateInput: CatalogCandidate,
  report: SnapshotValidationReport,
): Promise<void> {
  let candidate: CatalogCandidate;
  try {
    candidate = CatalogCandidateSchema.parse(candidateInput);
    assertPublishable(report);
    assertReportMatchesCandidate(candidate, report);
    candidate.documents.forEach(sourceUrlOf);
  } catch (error) {
    await recordPrePublicationFailure(db, candidateInput, report, error);
    throw error;
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.catalogSnapshot)
      .where(
        and(
          eq(schema.catalogSnapshot.id, candidate.snapshotId),
          eq(schema.catalogSnapshot.status, "failed"),
        ),
      );
    await tx.insert(schema.catalogSnapshot).values({
      ...snapshotValues(candidate, report),
      status: "building",
    });

    if (candidate.documents.length > 0) {
      await tx.insert(schema.catalogSourceDocument).values(
        candidate.documents.map((document) => ({
          snapshotId: candidate.snapshotId,
          sourceUrl: sourceUrlOf(document),
          // JSONB canonicalizes object key order, while Task 6 hashes the exact
          // JSON serialization. A JSONB string preserves those sealed bytes.
          data: JSON.stringify(document),
        })),
      );
    }
    if (candidate.courses.length > 0) {
      await tx.insert(schema.catalogCourse).values(
        candidate.courses.map((course) => ({
          snapshotId: candidate.snapshotId,
          courseId: course.id,
          stableId: `nyu-shanghai:${course.id}`,
          sourceId: "nyu-shanghai",
          code: course.id,
          subject: course.department,
          title: course.title,
          minCredits: course.minCredits ?? course.credits,
          maxCredits: course.maxCredits ?? course.credits,
          level: "undergraduate" as const,
          catalogOfferingTerms: course.offered,
          searchText: `${course.id} ${course.title}`.toLowerCase(),
          data: course,
        })),
      );
    }
    if (candidate.programs.length > 0) {
      await tx.insert(schema.catalogProgram).values(
        candidate.programs.map((program) => ({
          snapshotId: candidate.snapshotId,
          programId: program.id,
          data: program,
        })),
      );
    }

    const [[documents], [courses], [programs]] = await Promise.all([
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.catalogSourceDocument)
        .where(eq(schema.catalogSourceDocument.snapshotId, candidate.snapshotId)),
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.catalogCourse)
        .where(eq(schema.catalogCourse.snapshotId, candidate.snapshotId)),
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.catalogProgram)
        .where(eq(schema.catalogProgram.snapshotId, candidate.snapshotId)),
    ]);
    if (
      documents.count !== candidate.documents.length ||
      courses.count !== candidate.courses.length ||
      programs.count !== candidate.programs.length
    ) {
      throw new CatalogPublicationError(
        "Persisted catalog counts do not match the validated candidate.",
      );
    }

    await tx
      .update(schema.catalogSnapshot)
      .set({ status: "retired" })
      .where(
        and(
          eq(schema.catalogSnapshot.sourceId, "nyu-shanghai"),
          eq(schema.catalogSnapshot.status, "active"),
        ),
      );
    await tx
      .update(schema.catalogSnapshot)
      .set({ status: "active", completedAt: new Date() })
      .where(eq(schema.catalogSnapshot.id, candidate.snapshotId));
  });
}

/** Returns a schema-validated, coherent active snapshot, or null. */
export async function getActiveCatalog(
  db: CatalogDb,
): Promise<CatalogCandidate | null> {
  const [snapshot] = await db
    .select()
    .from(schema.catalogSnapshot)
    .where(eq(schema.catalogSnapshot.status, "active"))
    .limit(1);
  if (!snapshot) return null;

  const documents = await db
    .select({ data: schema.catalogSourceDocument.data })
    .from(schema.catalogSourceDocument)
    .where(eq(schema.catalogSourceDocument.snapshotId, snapshot.id))
    .orderBy(asc(schema.catalogSourceDocument.sourceUrl));
  const courses = await db
    .select({ data: schema.catalogCourse.data })
    .from(schema.catalogCourse)
    .where(eq(schema.catalogCourse.snapshotId, snapshot.id))
    .orderBy(asc(schema.catalogCourse.courseId));
  const programs = await db
    .select({ data: schema.catalogProgram.data })
    .from(schema.catalogProgram)
    .where(eq(schema.catalogProgram.snapshotId, snapshot.id))
    .orderBy(asc(schema.catalogProgram.programId));

  const candidate = CatalogCandidateSchema.parse({
    snapshotId: snapshot.id,
    sourceHash: snapshot.sourceHash,
    documents: documents.map((row) => persistedDocument(row.data)),
    courses: courses.map((row) => row.data),
    programs: programs.map((row) => row.data),
    sourceReferenceIds: snapshot.sourceReferenceIds,
    externalCourseIds: snapshot.externalCourseIds,
    unresolvedCourseIds: snapshot.unresolvedCourseIds,
  });
  assertPublishable(validateCatalogCandidate(candidate));
  return candidate;
}

function statusEntry(
  row: typeof schema.catalogSnapshot.$inferSelect,
): CatalogStatusEntry {
  return {
    id: row.id,
    sourceHash: row.sourceHash,
    status: row.status,
    validationReport: SnapshotValidationReportSchema.parse(
      row.validationReport,
    ),
    documentCount: row.documentCount,
    courseCount: row.courseCount,
    programCount: row.programCount,
    failureSummary: row.failureSummary,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

/** Active publication plus the ten most recent synchronization outcomes. */
export async function getCatalogStatus(db: CatalogDb): Promise<CatalogStatus> {
  const [active] = await db
    .select()
    .from(schema.catalogSnapshot)
    .where(eq(schema.catalogSnapshot.status, "active"))
    .limit(1);
  const rows = await db
    .select()
    .from(schema.catalogSnapshot)
    .orderBy(desc(schema.catalogSnapshot.startedAt))
    .limit(10);
  return {
    active: active ? statusEntry(active) : null,
    recent: rows.map(statusEntry),
  };
}

export type SourcePublicationResult =
  | { status: "published"; snapshotId: string }
  | { status: "unchanged"; snapshotId: string };

export interface CatalogSourceStatus {
  sourceId: string;
  schoolName: string;
  campus: "shanghai" | "new-york";
  enabled: boolean;
  activeSnapshotId: string | null;
  activeCourseCount: number;
  quarantinedCount: number;
  lastFailure: string | null;
}

function assertSourceReportMatches(
  candidate: SourceCatalogCandidate,
  report: SnapshotValidationReport,
) {
  const expected = {
    snapshotId: candidate.snapshotId,
    sourceHash: candidate.sourceHash,
    documentCount: candidate.documents.length,
    courseCount: candidate.courses.length,
    programCount: candidate.programs.length,
    sourceRowCount: 0,
    requirementRowCount: 0,
  };
  if (JSON.stringify(report.summary) !== JSON.stringify(expected)) {
    throw new CatalogPublicationError(
      "The validation report does not describe this source candidate.",
    );
  }
}

async function upsertCatalogSource(
  db: CatalogDb,
  sourceId: string,
): Promise<void> {
  const source = getCatalogSource(sourceId);
  await db
    .insert(schema.catalogSource)
    .values({
      id: source.id,
      schoolName: source.schoolName,
      campus: source.campus,
      bulletinRoot: source.bulletinRoot,
      enabled: source.enabled,
    })
    .onConflictDoUpdate({
      target: schema.catalogSource.id,
      set: {
        schoolName: source.schoolName,
        campus: source.campus,
        bulletinRoot: source.bulletinRoot,
        enabled: source.enabled,
        updatedAt: new Date(),
      },
    });
}

export async function ensureCatalogSource(
  db: CatalogDb,
  sourceId: string,
): Promise<void> {
  await upsertCatalogSource(db, sourceId);
}

/** Publishes one validated source without changing any other source pointer. */
export async function publishSourceCandidate(
  db: CatalogDb,
  candidate: SourceCatalogCandidate,
  report: SnapshotValidationReport,
): Promise<SourcePublicationResult> {
  assertPublishable(report);
  assertSourceReportMatches(candidate, report);
  const source = getCatalogSource(candidate.sourceId);
  candidate.documents.forEach(sourceUrlOf);
  const records = candidate.courses.map((record) =>
    CatalogCourseRecordSchema.parse(record),
  );
  await upsertCatalogSource(db, source.id);

  const [unchanged] = await db
    .select({ id: schema.catalogSnapshot.id })
    .from(schema.catalogSnapshot)
    .where(
      and(
        eq(schema.catalogSnapshot.sourceId, source.id),
        eq(schema.catalogSnapshot.sourceHash, candidate.sourceHash),
        eq(schema.catalogSnapshot.status, "active"),
      ),
    )
    .limit(1);
  if (unchanged) return { status: "unchanged", snapshotId: unchanged.id };

  await db.transaction(async (tx) => {
    await tx.insert(schema.catalogSnapshot).values({
      id: candidate.snapshotId,
      sourceId: source.id,
      sourceHash: candidate.sourceHash,
      status: "building",
      validationReport: report,
      documentCount: candidate.documents.length,
      courseCount: records.length,
      programCount: candidate.programs.length,
      quarantinedCount: candidate.quarantinedCourses.length,
      sourceReferenceIds: candidate.sourceReferenceIds,
      externalCourseIds: [],
      unresolvedCourseIds: candidate.unresolvedCourseIds,
    });
    if (candidate.documents.length > 0) {
      await tx.insert(schema.catalogSourceDocument).values(
        candidate.documents.map((document) => ({
          snapshotId: candidate.snapshotId,
          sourceUrl: sourceUrlOf(document),
          data: JSON.stringify(document),
        })),
      );
    }
    if (records.length > 0) {
      await tx.insert(schema.catalogCourse).values(
        records.map((record) => ({
          snapshotId: candidate.snapshotId,
          courseId: record.stableId,
          stableId: record.stableId,
          sourceId: record.sourceId,
          code: record.code,
          subject: record.subject,
          title: record.course.title,
          minCredits: record.course.minCredits ?? record.course.credits,
          maxCredits: record.course.maxCredits ?? record.course.credits,
          level: record.level,
          catalogOfferingTerms: record.catalogOfferingTerms,
          searchText: [
            record.code,
            record.course.title,
            record.subject,
            record.course.description ?? "",
          ]
            .join(" ")
            .toLowerCase(),
          data: record,
        })),
      );
    }
    if (candidate.programs.length > 0) {
      await tx.insert(schema.catalogProgram).values(
        candidate.programs.map((program) => ({
          snapshotId: candidate.snapshotId,
          programId: program.id,
          data: program,
        })),
      );
    }
    await tx
      .update(schema.catalogSnapshot)
      .set({ status: "retired" })
      .where(
        and(
          eq(schema.catalogSnapshot.sourceId, source.id),
          eq(schema.catalogSnapshot.status, "active"),
        ),
      );
    await tx
      .update(schema.catalogSnapshot)
      .set({ status: "active", completedAt: new Date() })
      .where(eq(schema.catalogSnapshot.id, candidate.snapshotId));
  });

  return { status: "published", snapshotId: candidate.snapshotId };
}

function releaseId(sourceSnapshotIds: Record<string, string>): string {
  const canonical = Object.entries(sourceSnapshotIds).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `release-${createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex")
    .slice(0, 24)}`;
}

export async function getActiveCatalogRelease(
  db: CatalogDb,
): Promise<CatalogReleaseRef | null> {
  const [release] = await db
    .select()
    .from(schema.catalogRelease)
    .where(eq(schema.catalogRelease.status, "active"))
    .limit(1);
  if (!release || !release.publishedAt) return null;
  return CatalogReleaseRefSchema.parse({
    id: release.id,
    sourceSnapshotIds: release.sourceSnapshotIds,
    publishedAt: release.publishedAt.toISOString(),
  });
}

export interface ActiveReleaseCatalog {
  release: CatalogReleaseRef;
  courses: ReturnType<typeof CatalogCourseRecordSchema.parse>[];
  programs: CatalogProgram[];
}

/** Reads only snapshots explicitly referenced by the active release. */
export async function getActiveReleaseCatalog(
  db: CatalogDb,
): Promise<ActiveReleaseCatalog | null> {
  const release = await getActiveCatalogRelease(db);
  if (!release) return null;
  const memberships = await db
    .select({
      sourceId: schema.catalogReleaseSource.sourceId,
      snapshotId: schema.catalogReleaseSource.snapshotId,
    })
    .from(schema.catalogReleaseSource)
    .where(eq(schema.catalogReleaseSource.releaseId, release.id));
  const membershipMap = Object.fromEntries(
    memberships.map((row) => [row.sourceId, row.snapshotId]),
  );
  const releaseEntries = Object.entries(release.sourceSnapshotIds);
  if (
    memberships.length !== releaseEntries.length ||
    releaseEntries.some(
      ([sourceId, snapshotId]) => membershipMap[sourceId] !== snapshotId,
    )
  ) {
    throw new CatalogPublicationError(
      "Active release membership does not match its sealed source map.",
    );
  }
  const snapshotIds = memberships.map((row) => row.snapshotId);
  const courseRows = snapshotIds.length
    ? await db
        .select({
          snapshotId: schema.catalogCourse.snapshotId,
          sourceId: schema.catalogCourse.sourceId,
          data: schema.catalogCourse.data,
        })
        .from(schema.catalogCourse)
        .where(inArray(schema.catalogCourse.snapshotId, snapshotIds))
        .orderBy(asc(schema.catalogCourse.stableId))
    : [];
  const courses = courseRows.map((row) => {
    const parsed = CatalogCourseRecordSchema.safeParse(row.data);
    if (parsed.success) {
      if (
        parsed.data.sourceId !== row.sourceId ||
        parsed.data.sourceSnapshotId !== row.snapshotId ||
        membershipMap[parsed.data.sourceId] !== parsed.data.sourceSnapshotId
      ) {
        throw new CatalogPublicationError(
          "A release course has orphaned source provenance.",
        );
      }
      return parsed.data;
    }
    const course = CourseSchema.parse(row.data);
    return CatalogCourseRecordSchema.parse({
      stableId: `${row.sourceId}:${course.id}`,
      sourceId: row.sourceId,
      sourceSnapshotId: row.snapshotId,
      code: course.id,
      subject: course.department,
      level: "undergraduate",
      catalogOfferingTerms: course.offered,
      catalogOfferingText: course.offeringText ?? null,
      course,
      crossListedStableIds: [],
    });
  });
  const shanghaiSnapshotId = membershipMap["nyu-shanghai"];
  const programRows = shanghaiSnapshotId
    ? await db
        .select({ data: schema.catalogProgram.data })
        .from(schema.catalogProgram)
        .where(eq(schema.catalogProgram.snapshotId, shanghaiSnapshotId))
        .orderBy(asc(schema.catalogProgram.programId))
    : [];
  const programs = programRows.map((row) => CatalogProgramSchema.parse(row.data));
  const overlays = await db.select().from(schema.catalogOverlay).where(eq(schema.catalogOverlay.status, "active"));
  return {
    release,
    courses: courses.flatMap((course) => {
      const result = applyCourseOverlays(course, overlays);
      return result.deleted ? [] : [result.value];
    }),
    programs: applyProgramOverlays(programs, overlays).value,
  };
}

/** Atomically activates an exact, source-complete set of healthy snapshots. */
export async function composeCatalogRelease(
  db: CatalogDb,
  sourceSnapshotIds: Record<string, string>,
): Promise<CatalogReleaseRef> {
  const canonicalMembership = Object.fromEntries(
    Object.entries(sourceSnapshotIds).sort(([a], [b]) => a.localeCompare(b)),
  );
  if (Object.keys(canonicalMembership).length === 0) {
    throw new CatalogPublicationError("A catalog release cannot be empty.");
  }
  const current = await getActiveCatalogRelease(db);
  if (
    current &&
    JSON.stringify(current.sourceSnapshotIds) === JSON.stringify(canonicalMembership)
  ) {
    return current;
  }

  const enabledSources = await db
    .select({ id: schema.catalogSource.id })
    .from(schema.catalogSource)
    .where(eq(schema.catalogSource.enabled, true));
  const expectedIds = enabledSources.map((row) => row.id).sort();
  if (JSON.stringify(Object.keys(canonicalMembership)) !== JSON.stringify(expectedIds)) {
    throw new CatalogPublicationError(
      "Catalog release membership does not cover every enabled source.",
    );
  }
  const snapshotIds = Object.values(canonicalMembership);
  const snapshots = await db
    .select({
      id: schema.catalogSnapshot.id,
      sourceId: schema.catalogSnapshot.sourceId,
      status: schema.catalogSnapshot.status,
    })
    .from(schema.catalogSnapshot)
    .where(inArray(schema.catalogSnapshot.id, snapshotIds));
  const snapshotsById = new Map(snapshots.map((row) => [row.id, row]));
  for (const [sourceId, snapshotId] of Object.entries(canonicalMembership)) {
    const snapshot = snapshotsById.get(snapshotId);
    if (!snapshot || snapshot.sourceId !== sourceId || snapshot.status !== "active") {
      throw new CatalogPublicationError(
        "Catalog release contains an unhealthy or cross-source snapshot.",
      );
    }
  }

  const [candidateCourseRows, candidateProgramRows, activeOverlays] = await Promise.all([
    db.select({ data: schema.catalogCourse.data }).from(schema.catalogCourse).where(inArray(schema.catalogCourse.snapshotId, snapshotIds)),
    db.select({ data: schema.catalogProgram.data }).from(schema.catalogProgram).where(inArray(schema.catalogProgram.snapshotId, snapshotIds)),
    db.select().from(schema.catalogOverlay).where(eq(schema.catalogOverlay.status, "active")),
  ]);
  const reconciliation = reconcileCatalogOverlays(
    candidateCourseRows.map((row) => CatalogCourseRecordSchema.parse(row.data)),
    candidateProgramRows.map((row) => CatalogProgramSchema.parse(row.data)),
    activeOverlays,
  );

  const id = releaseId(canonicalMembership);
  const publishedAt = new Date();
  await db.transaction(async (tx) => {
    if (reconciliation.supersededOverlayIds.length > 0) {
      await tx.update(schema.catalogOverlay).set({ status: "superseded", supersededAt: publishedAt })
        .where(inArray(schema.catalogOverlay.id, reconciliation.supersededOverlayIds));
    }
    await tx
      .update(schema.catalogRelease)
      .set({ status: "retired" })
      .where(eq(schema.catalogRelease.status, "active"));
    const [existing] = await tx
      .select({ id: schema.catalogRelease.id })
      .from(schema.catalogRelease)
      .where(eq(schema.catalogRelease.id, id))
      .limit(1);
    if (existing) {
      await tx
        .update(schema.catalogRelease)
        .set({ status: "active", publishedAt })
        .where(eq(schema.catalogRelease.id, id));
    } else {
      await tx.insert(schema.catalogRelease).values({
        id,
        status: "active",
        sourceSnapshotIds: canonicalMembership,
        publishedAt,
      });
      await tx.insert(schema.catalogReleaseSource).values(
        Object.entries(canonicalMembership).map(([sourceId, snapshotId]) => ({
          releaseId: id,
          sourceId,
          snapshotId,
        })),
      );
    }
  });
  return CatalogReleaseRefSchema.parse({
    id,
    sourceSnapshotIds: canonicalMembership,
    publishedAt: publishedAt.toISOString(),
  });
}

export async function getCatalogSourceStatuses(
  db: CatalogDb,
): Promise<CatalogSourceStatus[]> {
  const sources = await db
    .select()
    .from(schema.catalogSource)
    .orderBy(asc(schema.catalogSource.id));
  const statuses: CatalogSourceStatus[] = [];
  for (const source of sources) {
    const [active] = await db
      .select()
      .from(schema.catalogSnapshot)
      .where(
        and(
          eq(schema.catalogSnapshot.sourceId, source.id),
          eq(schema.catalogSnapshot.status, "active"),
        ),
      )
      .limit(1);
    const [failed] = await db
      .select({ failureSummary: schema.catalogSnapshot.failureSummary })
      .from(schema.catalogSnapshot)
      .where(
        and(
          eq(schema.catalogSnapshot.sourceId, source.id),
          eq(schema.catalogSnapshot.status, "failed"),
        ),
      )
      .orderBy(desc(schema.catalogSnapshot.startedAt))
      .limit(1);
    statuses.push({
      sourceId: source.id,
      schoolName: source.schoolName,
      campus: source.campus,
      enabled: source.enabled,
      activeSnapshotId: active?.id ?? null,
      activeCourseCount: active?.courseCount ?? 0,
      quarantinedCount: active?.quarantinedCount ?? 0,
      lastFailure: failed?.failureSummary ?? null,
    });
  }
  return statuses;
}
