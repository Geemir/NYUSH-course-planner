import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../../src/db/schema";
import fallback from "../../../src/data/catalog-fallback.json";
import { CATALOG_SOURCES } from "../../../src/lib/bulletin/sourceRegistry";
import { CatalogCourseRecordSchema, type CatalogCourseRecord } from "../../../src/lib/catalog/types";
import { CatalogProgramSchema, CourseSchema, type Course } from "../../../src/lib/types";

export const E2E_DB_DIR = process.env.PGLITE_DIR ?? ".pglite-e2e";

function validationReport(snapshotId: string, sourceHash: string, courseCount: number, programCount: number) {
  return {
    summary: { snapshotId, sourceHash, documentCount: 1, courseCount, programCount, sourceRowCount: 0, requirementRowCount: 0 },
    errors: [],
    warnings: [],
  };
}

function courseRecord(sourceId: string, snapshotId: string, index: number): CatalogCourseRecord {
  const base = CourseSchema.parse(fallback.courses[0]);
  const code = sourceId === "nyu-shanghai" ? base.id : `E2E-${String(index).padStart(2, "0")} 101`;
  const course: Course = {
    ...base,
    id: code,
    department: sourceId === "nyu-shanghai" ? base.department : `E2E-${String(index).padStart(2, "0")}`,
    title: sourceId === "nyu-shanghai" ? base.title : `${CATALOG_SOURCES[index].schoolName} Study Away Seminar`,
    description: sourceId === "nyu-shanghai" ? base.description : "A deterministic undergraduate catalog fixture for study-away discovery.",
    sites: sourceId === "nyu-shanghai" ? ["shanghai"] : ["new-york"],
    fulfills: [],
    provenance: { snapshotId, sourceHash: `e2e-hash-${index}`, sourceUrl: CATALOG_SOURCES[index].courseIndexUrl },
  };
  return CatalogCourseRecordSchema.parse({
    stableId: `${sourceId}:${code}`,
    sourceId,
    sourceSnapshotId: snapshotId,
    code,
    subject: course.department,
    level: "undergraduate",
    catalogOfferingTerms: [],
    catalogOfferingText: null,
    course,
    crossListedStableIds: [],
  });
}

export async function seedE2EDatabase() {
  const client = new PGlite(E2E_DB_DIR);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });

  await db.delete(schema.notification);
  await db.delete(schema.catalogOverlay);
  await db.delete(schema.correctionEvent);
  await db.delete(schema.correctionMessage);
  await db.delete(schema.correctionRequest);
  await db.delete(schema.plans);
  await db.delete(schema.sessions);
  await db.delete(schema.accounts);
  await db.delete(schema.users);
  await db.delete(schema.catalogReleaseSource);
  await db.delete(schema.catalogRelease);
  await db.delete(schema.catalogProgram);
  await db.delete(schema.catalogCourse);
  await db.delete(schema.catalogSourceDocument);
  await db.delete(schema.catalogSnapshot);
  await db.delete(schema.catalogSource);

  const sourceSnapshotIds: Record<string, string> = {};
  for (const [index, source] of CATALOG_SOURCES.entries()) {
    const snapshotId = `e2e-snapshot-${index}`;
    const record = courseRecord(source.id, snapshotId, index);
    const programCount = source.id === "nyu-shanghai" ? fallback.programs.length : 0;
    sourceSnapshotIds[source.id] = snapshotId;
    await db.insert(schema.catalogSource).values({ id: source.id, schoolName: source.schoolName, campus: source.campus, bulletinRoot: source.bulletinRoot });
    await db.insert(schema.catalogSnapshot).values({ id: snapshotId, sourceId: source.id, sourceHash: `e2e-hash-${index}`, status: "active", validationReport: validationReport(snapshotId, `e2e-hash-${index}`, 1, programCount), documentCount: 1, courseCount: 1, programCount, quarantinedCount: 0, sourceReferenceIds: [], externalCourseIds: [], unresolvedCourseIds: [], completedAt: new Date() });
    await db.insert(schema.catalogSourceDocument).values({ snapshotId, sourceUrl: source.courseIndexUrl, data: { sourceUrl: source.courseIndexUrl } });
    await db.insert(schema.catalogCourse).values({ snapshotId, courseId: record.stableId, stableId: record.stableId, sourceId: source.id, code: record.code, subject: record.subject, title: record.course.title, minCredits: record.course.minCredits ?? record.course.credits, maxCredits: record.course.maxCredits ?? record.course.credits, level: "undergraduate", catalogOfferingTerms: [], searchText: `${record.code} ${record.course.title}`.toLowerCase(), data: record });
    if (source.id === "nyu-shanghai") {
      await db.insert(schema.catalogProgram).values(fallback.programs.map((input) => {
        const program = CatalogProgramSchema.parse(input);
        return { snapshotId, programId: program.id, data: program };
      }));
    }
  }

  await db.insert(schema.catalogRelease).values({ id: "e2e-release", status: "active", sourceSnapshotIds, publishedAt: new Date() });
  await db.insert(schema.catalogReleaseSource).values(Object.entries(sourceSnapshotIds).map(([sourceId, snapshotId]) => ({ releaseId: "e2e-release", sourceId, snapshotId })));
  await client.close();
}

export async function insertE2ESession(role: "student" | "admin") {
  const client = new PGlite(E2E_DB_DIR);
  const db = drizzle(client, { schema });
  const id = `e2e-${role}`;
  const email = `${role}@nyu.edu`;
  const sessionToken = `e2e-${role}-session`;
  await db.insert(schema.users).values({ id, email, name: `E2E ${role}`, role }).onConflictDoUpdate({ target: schema.users.id, set: { email, role } });
  await db.delete(schema.sessions).where(eq(schema.sessions.sessionToken, sessionToken));
  await db.insert(schema.sessions).values({ sessionToken, userId: id, expires: new Date("2099-01-01T00:00:00.000Z") });
  await client.close();
  return { sessionToken, userId: id, email };
}

if (process.argv.includes("--seed")) {
  void (async () => {
    await seedE2EDatabase();
    await insertE2ESession("student");
    await insertE2ESession("admin");
    console.log(`Seeded isolated E2E database at ${E2E_DB_DIR}.`);
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
