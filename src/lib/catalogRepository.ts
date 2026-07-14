import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import {
  assertPublishable,
  type SnapshotValidationReport,
} from "@/lib/bulletin/validateSnapshot";
import {
  CatalogCandidateSchema,
  type CatalogCandidate,
} from "@/lib/types";

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
          data: document,
        })),
      );
    }
    if (candidate.courses.length > 0) {
      await tx.insert(schema.catalogCourse).values(
        candidate.courses.map((course) => ({
          snapshotId: candidate.snapshotId,
          courseId: course.id,
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
      .where(eq(schema.catalogSnapshot.status, "active"));
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

  return CatalogCandidateSchema.parse({
    snapshotId: snapshot.id,
    sourceHash: snapshot.sourceHash,
    documents: documents.map((row) => row.data),
    courses: courses.map((row) => row.data),
    programs: programs.map((row) => row.data),
    sourceReferenceIds: snapshot.sourceReferenceIds,
    externalCourseIds: snapshot.externalCourseIds,
    unresolvedCourseIds: snapshot.unresolvedCourseIds,
  });
}

function statusEntry(
  row: typeof schema.catalogSnapshot.$inferSelect,
): CatalogStatusEntry {
  return {
    id: row.id,
    sourceHash: row.sourceHash,
    status: row.status,
    validationReport: row.validationReport,
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
