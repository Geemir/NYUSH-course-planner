/**
 * Seeds the local dev database with the checked-in NYUSH recovery catalog
 * (`src/data/catalog-fallback.json`: ~810 courses + 43 programs) as an active
 * catalog release — no Bulletin scraping required.
 *
 * Use this to bring a fresh/reset `.pglite` up to a working state when
 * `bulletin:sync` can't run (offline, flaky NY sources, or a cold start where
 * the fail-closed validation gates reject a partial network capture):
 *
 *   npm run db:push          # ensure the schema exists
 *   npx tsx --conditions=react-server scripts/seed-dev-catalog.ts
 *
 * A later successful `bulletin:sync` supersedes this seeded release.
 */
import { db } from "@/db";
import fallback from "@/data/catalog-fallback.json";
import { getCatalogSource } from "@/lib/bulletin/sourceRegistry";
import * as schema from "@/db/schema";
import { CatalogCourseRecordSchema } from "@/lib/catalog/types";
import { CatalogProgramSchema, CourseSchema } from "@/lib/types";

const SOURCE_ID = "nyu-shanghai";
const SNAPSHOT_ID = "recovery-fallback";
const RELEASE_ID = "recovery-fallback-release";

async function main() {
  const source = getCatalogSource(SOURCE_ID);
  const courses = CourseSchema.array().parse(fallback.courses);
  const programs = fallback.programs.map((input) => CatalogProgramSchema.parse(input));

  // Clear only the catalog tables (leave users/plans/sessions untouched).
  await db.delete(schema.catalogReleaseSource);
  await db.delete(schema.catalogRelease);
  await db.delete(schema.catalogProgram);
  await db.delete(schema.catalogCourse);
  await db.delete(schema.catalogSourceDocument);
  await db.delete(schema.catalogSnapshot);
  await db.delete(schema.catalogSource);

  await db.insert(schema.catalogSource).values({
    id: source.id,
    schoolName: source.schoolName,
    campus: source.campus,
    bulletinRoot: source.bulletinRoot,
  });

  await db.insert(schema.catalogSnapshot).values({
    id: SNAPSHOT_ID,
    sourceId: SOURCE_ID,
    sourceHash: "recovery-fallback-hash",
    status: "active",
    validationReport: {
      summary: {
        snapshotId: SNAPSHOT_ID,
        sourceHash: "recovery-fallback-hash",
        documentCount: 1,
        courseCount: courses.length,
        programCount: programs.length,
        sourceRowCount: 0,
        requirementRowCount: 0,
      },
      errors: [],
      warnings: [],
    },
    documentCount: 1,
    courseCount: courses.length,
    programCount: programs.length,
    quarantinedCount: 0,
    sourceReferenceIds: [],
    externalCourseIds: [],
    unresolvedCourseIds: [],
    completedAt: new Date(),
  });

  await db.insert(schema.catalogSourceDocument).values({
    snapshotId: SNAPSHOT_ID,
    sourceUrl: source.courseIndexUrl,
    data: { sourceUrl: source.courseIndexUrl },
  });

  const courseRows = courses.map((course) => {
    const record = CatalogCourseRecordSchema.parse({
      stableId: `${SOURCE_ID}:${course.id}`,
      sourceId: SOURCE_ID,
      sourceSnapshotId: SNAPSHOT_ID,
      code: course.id,
      subject: course.department,
      level: "undergraduate",
      catalogOfferingTerms: [],
      catalogOfferingText: null,
      course,
      crossListedStableIds: [],
    });
    return {
      snapshotId: SNAPSHOT_ID,
      courseId: record.stableId,
      stableId: record.stableId,
      sourceId: SOURCE_ID,
      code: record.code,
      subject: record.subject,
      title: course.title,
      minCredits: course.minCredits ?? course.credits,
      maxCredits: course.maxCredits ?? course.credits,
      level: "undergraduate" as const,
      catalogOfferingTerms: [],
      // Same fields the bulletin sync indexes — code, title, subject, and
      // description — so description keywords are searchable on seeded DBs too.
      searchText: [record.code, course.title, record.subject, course.description ?? ""].join(" ").toLowerCase(),
      data: record,
    };
  });
  // Chunked insert keeps PGlite parameter counts sane.
  for (let i = 0; i < courseRows.length; i += 200) {
    await db.insert(schema.catalogCourse).values(courseRows.slice(i, i + 200));
  }

  await db.insert(schema.catalogProgram).values(
    programs.map((program) => ({ snapshotId: SNAPSHOT_ID, programId: program.id, data: program })),
  );

  await db.insert(schema.catalogRelease).values({
    id: RELEASE_ID,
    status: "active",
    sourceSnapshotIds: { [SOURCE_ID]: SNAPSHOT_ID },
    publishedAt: new Date(),
  });
  await db.insert(schema.catalogReleaseSource).values({
    releaseId: RELEASE_ID,
    sourceId: SOURCE_ID,
    snapshotId: SNAPSHOT_ID,
  });

  console.log(`Seeded ${courseRows.length} courses and ${programs.length} programs as active release "${RELEASE_ID}".`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
