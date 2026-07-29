import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  readCatalogBootstrap,
  readCatalogCourse,
  readCatalogCourseBatch,
  searchCatalogCourses,
} from "@/lib/catalog/searchRepository";
import { CatalogCourseQuerySchema } from "@/lib/catalog/contracts";
import type { CatalogCourseRecord } from "@/lib/catalog/types";

let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
const releaseId = "release-search";

function record(sourceId: string, snapshotId: string, code: string, title: string): CatalogCourseRecord {
  const sourceUrl = `https://bulletins.nyu.edu/undergraduate/${sourceId === "nyu-shanghai" ? "shanghai" : "business"}/courses/test/`;
  return {
    stableId: `${sourceId}:${code}`,
    sourceId,
    sourceSnapshotId: snapshotId,
    code,
    subject: code.split(" ")[0],
    level: "undergraduate",
    catalogOfferingTerms: ["fall"],
    catalogOfferingText: "Fall",
    course: {
      id: code,
      title,
      credits: 4,
      minCredits: 4,
      maxCredits: 4,
      department: code.split(" ")[0],
      description: `${title} description`,
      prereqs: [],
      sourceReferenceIds: [],
      offered: [],
      offeringKnown: false,
      sites: [sourceId === "nyu-shanghai" ? "shanghai" : "new-york"],
      fulfills: [],
      equivalentTo: [],
      attributes: [],
      tags: [],
      provenance: { sourceUrl, snapshotId, sourceHash: "hash" },
    },
    crossListedStableIds: [],
  };
}

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(schema.catalogSource).values({
    id: "nyu-new-york-business",
    schoolName: "Stern",
    campus: "new-york",
    bulletinRoot: "https://bulletins.nyu.edu/undergraduate/business/",
  }).onConflictDoNothing();
  const snapshots = [
    ["nyu-shanghai", "shanghai-active"],
    ["nyu-new-york-business", "stern-active"],
  ] as const;
  for (const [sourceId, id] of snapshots) {
    await db.insert(schema.catalogSnapshot).values({
      id, sourceId, sourceHash: `${id}-hash`, status: "active",
      validationReport: { summary: { snapshotId: id, sourceHash: `${id}-hash`, documentCount: 0, courseCount: 1, programCount: 0, sourceRowCount: 0, requirementRowCount: 0 }, errors: [], warnings: [] },
      documentCount: 0, courseCount: 1, programCount: 0,
      sourceReferenceIds: [], externalCourseIds: [], unresolvedCourseIds: [],
    });
  }
  const descriptionOnlyMatch = record("nyu-shanghai", "shanghai-active", "MATH-SHU 140", "Linear Algebra");
  descriptionOnlyMatch.course.description = "Vector spaces with applications to data analysis.";
  const records = [
    record("nyu-shanghai", "shanghai-active", "CSCI-SHU 101", "Computer Science"),
    record("nyu-shanghai", "shanghai-active", "CSCI-SHU 210", "Data Structures"),
    record("nyu-shanghai", "shanghai-active", "BUSF-SHU 101", "Introduction to Data and Business Analytics"),
    descriptionOnlyMatch,
    record("nyu-new-york-business", "stern-active", "ACCT-UB 1", "Financial Accounting"),
  ];
  for (const item of records) {
    await db.insert(schema.catalogCourse).values({
      snapshotId: item.sourceSnapshotId, courseId: item.stableId, stableId: item.stableId,
      sourceId: item.sourceId, code: item.code, subject: item.subject, title: item.course.title,
      minCredits: 4, maxCredits: 4, level: "undergraduate", catalogOfferingTerms: item.catalogOfferingTerms,
      searchText: `${item.code} ${item.course.title} ${item.course.description}`.toLowerCase(), data: item,
    });
  }
  const membership = { "nyu-shanghai": "shanghai-active", "nyu-new-york-business": "stern-active" };
  await db.insert(schema.catalogRelease).values({ id: releaseId, status: "active", sourceSnapshotIds: membership, publishedAt: new Date() });
  await db.insert(schema.catalogReleaseSource).values(Object.entries(membership).map(([sourceId, snapshotId]) => ({ releaseId, sourceId, snapshotId })));
});

afterAll(async () => client.close());

describe("active release catalog queries", () => {
  it("searches case-insensitively with deterministic cursor pages", async () => {
    const first = await searchCatalogCourses(db, CatalogCourseQuerySchema.parse({ limit: 1 }));
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = await searchCatalogCourses(db, CatalogCourseQuerySchema.parse({ limit: 1, cursor: first.nextCursor! }));
    expect(second.items[0].stableId).not.toBe(first.items[0].stableId);
    const search = await searchCatalogCourses(db, CatalogCourseQuerySchema.parse({ q: "ACCOUNTING" }));
    expect(search.items.map((item) => item.code)).toEqual(["ACCT-UB 1"]);
  });

  it("ranks title matches above description matches, code matches first", async () => {
    // Alphabetically BUSF < CSCI < MATH; relevance must reorder them:
    // title-prefix (Data Structures) > title-substring > description-only.
    const byRelevance = await searchCatalogCourses(db, CatalogCourseQuerySchema.parse({ q: "data" }));
    expect(byRelevance.items.map((item) => item.code)).toEqual([
      "CSCI-SHU 210",
      "BUSF-SHU 101",
      "MATH-SHU 140",
    ]);
    const byCode = await searchCatalogCourses(db, CatalogCourseQuerySchema.parse({ q: "CSCI-SHU 210" }));
    expect(byCode.items[0]?.code).toBe("CSCI-SHU 210");
  });

  it("matches every query word regardless of order and keeps ranked cursor pages stable", async () => {
    const reordered = await searchCatalogCourses(db, CatalogCourseQuerySchema.parse({ q: "structures data" }));
    expect(reordered.items.map((item) => item.code)).toEqual(["CSCI-SHU 210"]);

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await searchCatalogCourses(db, CatalogCourseQuerySchema.parse({ q: "data", limit: 1, ...(cursor ? { cursor } : {}) }));
      seen.push(...page.items.map((item) => item.code));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(["CSCI-SHU 210", "BUSF-SHU 101", "MATH-SHU 140"]);
  });

  it("reads detail and batch only from release members in request order", async () => {
    const stableIds = ["nyu-shanghai:CSCI-SHU 101", "missing", "nyu-new-york-business:ACCT-UB 1"];
    expect((await readCatalogCourse(db, stableIds[0]))?.code).toBe("CSCI-SHU 101");
    const batch = await readCatalogCourseBatch(db, stableIds);
    expect(batch.items.map((item) => item.stableId)).toEqual([stableIds[0], stableIds[2]]);
    expect(batch.missingStableIds).toEqual(["missing"]);
  });

  it("returns bootstrap metadata without a course payload", async () => {
    const bootstrap = await readCatalogBootstrap(db);
    expect(bootstrap.release.id).toBe(releaseId);
    expect(bootstrap.sources).toHaveLength(2);
    expect(bootstrap.filters.subjects.map((item) => item.subject)).toEqual(["ACCT-UB", "BUSF-SHU", "CSCI-SHU", "MATH-SHU"]);
    expect(bootstrap).not.toHaveProperty("courses");
  });

  it("composes reviewed overlays while leaving the snapshot row immutable", async () => {
    const stableId = "nyu-shanghai:CSCI-SHU 101";
    await db.insert(schema.users).values({ id: "overlay-student", email: "overlay@example.edu" });
    await db.insert(schema.correctionRequest).values({
      id: "overlay-request", userId: "overlay-student", targetKind: "course",
      targetData: { kind: "course", stableId }, issueType: "incorrect_course_information",
      catalogReleaseId: releaseId, contextData: {}, title: "Course title is incorrect",
      description: "The published course title needs a reviewed correction.", status: "applied",
    });
    await db.insert(schema.catalogOverlay).values({
      id: "overlay-course-title", requestId: "overlay-request", targetKind: "course", targetKey: stableId,
      patchType: "course", patchData: { kind: "course", stableId, changes: { title: "Reviewed Computer Science" } },
      sourceReleaseId: releaseId, appliedBy: "overlay-student", appliedAt: new Date("2026-07-18T00:00:00Z"),
    });

    const detail = await readCatalogCourse(db, stableId);
    expect(detail).toMatchObject({ reviewedOverlayIds: ["overlay-course-title"], course: { title: "Reviewed Computer Science" } });
    expect(detail?.overlayProvenance?.[0]).toMatchObject({ kind: "reviewed-overlay", referenceId: "overlay-course-title" });
    const [raw] = await db.select({ data: schema.catalogCourse.data }).from(schema.catalogCourse).where(eq(schema.catalogCourse.stableId, stableId));
    expect((raw.data as CatalogCourseRecord).course.title).toBe("Computer Science");

    await db.delete(schema.catalogOverlay).where(eq(schema.catalogOverlay.id, "overlay-course-title"));
    await db.delete(schema.correctionRequest).where(eq(schema.correctionRequest.id, "overlay-request"));
    await db.delete(schema.users).where(eq(schema.users.id, "overlay-student"));
  });

  it("hides directly tombstoned courses from search, detail, batch, and bootstrap filters", async () => {
    const stableId = "nyu-shanghai:MATH-SHU 140";
    await db.insert(schema.catalogOverlay).values({
      id: "direct-course-delete", requestId: null, origin: "direct", reason: "Duplicate Bulletin record.",
      targetKind: "course-delete", targetKey: stableId, patchType: "course-delete",
      patchData: { kind: "course-delete", stableId }, sourceReleaseId: releaseId,
    });

    expect(await readCatalogCourse(db, stableId)).toBeNull();
    expect((await searchCatalogCourses(db, CatalogCourseQuerySchema.parse({ q: "Linear Algebra" }))).items).toEqual([]);
    expect((await readCatalogCourseBatch(db, [stableId])).missingStableIds).toEqual([stableId]);
    expect((await readCatalogBootstrap(db)).filters.subjects.map((item) => item.subject)).not.toContain("MATH-SHU");
  });
});
