import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  CourseReferencedError,
  deleteCourse,
  emptySnapshot,
  ensureCatalogSeeded,
  getActivePlan,
  getAllCourses,
  saveActivePlan,
  upsertCourses,
  type Db,
} from "@/lib/repository";
import type { SnapshotValidationReport } from "@/lib/bulletin/validateSnapshot";
import type { CatalogProgram, Course } from "@/lib/types";

let db: Db;
let userId: string;
let concurrentUserId: string;
let inactiveUserId: string;

beforeAll(async () => {
  const client = new PGlite(); // in-memory
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [user] = await db
    .insert(schema.users)
    .values({ email: "test@nyu.edu" })
    .returning({ id: schema.users.id });
  userId = user.id;
  const [concurrentUser] = await db
    .insert(schema.users)
    .values({ email: "concurrent@nyu.edu" })
    .returning({ id: schema.users.id });
  concurrentUserId = concurrentUser.id;
  const [inactiveUser] = await db
    .insert(schema.users)
    .values({ email: "inactive@nyu.edu" })
    .returning({ id: schema.users.id });
  inactiveUserId = inactiveUser.id;
});

describe("plan repository", () => {
  it("returns null when a user has no plan", async () => {
    expect(await getActivePlan(db, userId)).toBeNull();
  });

  it("saves and reads back a plan snapshot (JSONB round-trip)", async () => {
    const snap = {
      ...emptySnapshot(),
      activePrograms: ["core", "ds", "ima-minor"],
      startYear: 2026,
      placements: [
        { courseId: "CSCI-SHU 101", semesterId: "Y1F" as const, allocation: "auto" },
      ],
    };
    await saveActivePlan(db, userId, snap);
    const read = await getActivePlan(db, userId);
    expect(read).toEqual(snap);
  });

  it("upserts (one active plan per user, no duplicates)", async () => {
    await saveActivePlan(db, userId, { ...emptySnapshot(), startYear: 2027 });
    const rows = await db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].snapshot.startYear).toBe(2027);
  });

  it("atomically resolves concurrent first saves to one coherent active plan", async () => {
    const first = {
      ...emptySnapshot(),
      startYear: 2028,
      activePrograms: ["core"],
      fulfillmentFacts: [
        {
          id: "first-waiver",
          kind: "waiver" as const,
          requirementId: "core/first",
          label: "First save",
        },
      ],
    };
    const second = {
      ...emptySnapshot(),
      startYear: 2029,
      activePrograms: ["cs"],
      fulfillmentFacts: [
        {
          id: "second-waiver",
          kind: "waiver" as const,
          requirementId: "core/second",
          label: "Second save",
        },
      ],
    };

    await Promise.all([
      saveActivePlan(db, concurrentUserId, first),
      saveActivePlan(db, concurrentUserId, second),
    ]);

    const rows = await db
      .select({ snapshot: schema.plans.snapshot })
      .from(schema.plans)
      .where(
        and(
          eq(schema.plans.userId, concurrentUserId),
          eq(schema.plans.isActive, true),
        ),
      );
    expect(rows).toHaveLength(1);
    expect([first, second]).toContainEqual(rows[0].snapshot);
  });

  it("ignores inactive plan rows", async () => {
    await db.insert(schema.plans).values({
      userId: inactiveUserId,
      isActive: false,
      snapshot: {
        ...emptySnapshot(),
        fulfillmentFacts: [],
        startYear: 2030,
      },
    });

    expect(await getActivePlan(db, inactiveUserId)).toBeNull();
  });
});

describe("course catalog repository", () => {
  it("seeds from JSON on first read, then is idempotent", async () => {
    const first = await getAllCourses(db);
    expect(first.length).toBeGreaterThanOrEqual(45);
    expect(first.some((c) => c.id === "CSCI-SHU 210")).toBe(true);
    // Seeding again must not duplicate.
    await ensureCatalogSeeded(db);
    const second = await getAllCourses(db);
    expect(second.length).toBe(first.length);
  });

  it("upserts a new course and updates an existing one", async () => {
    const newCourse: Course = {
      id: "TEST-SHU 999",
      title: "Imported Test Course",
      credits: 4,
      department: "Test",
      prereqs: [],
      offered: ["fall"],
      sites: ["shanghai"],
      fulfills: [],
      equivalentTo: [],
      tags: [],
    };
    const added = await upsertCourses(db, [newCourse], "import");
    expect(added).toBe(1);
    let all = await getAllCourses(db);
    expect(all.find((c) => c.id === "TEST-SHU 999")?.title).toBe(
      "Imported Test Course",
    );

    await upsertCourses(db, [{ ...newCourse, title: "Renamed" }], "import");
    all = await getAllCourses(db);
    expect(all.filter((c) => c.id === "TEST-SHU 999")).toHaveLength(1);
    expect(all.find((c) => c.id === "TEST-SHU 999")?.title).toBe("Renamed");
  });

  it("deletes a course from the catalog", async () => {
    await deleteCourse(db, "TEST-SHU 999");
    const all = await getAllCourses(db);
    expect(all.some((c) => c.id === "TEST-SHU 999")).toBe(false);
  });

  it("rejects deletion with deterministic plan, program, and rule references", async () => {
    const courseId = "REF-SHU 101";
    await upsertCourses(db, [testCourse(courseId)], "test");
    const planUserId = "course-reference-user";
    await db
      .insert(schema.users)
      .values({ id: planUserId, email: "course-reference@nyu.edu" });
    await saveActivePlan(db, planUserId, {
      ...emptySnapshot(),
      placements: [{ courseId, semesterId: "Y1F", allocation: "auto" }],
    });

    const snapshotId = "active-reference-snapshot";
    await db.insert(schema.catalogSnapshot).values({
      id: snapshotId,
      sourceHash: "active-reference-hash",
      status: "active",
      validationReport: validationReport(snapshotId, "active-reference-hash"),
      documentCount: 0,
      courseCount: 0,
      programCount: 1,
      sourceReferenceIds: [],
      externalCourseIds: [],
      unresolvedCourseIds: [],
      completedAt: new Date(),
    });
    await db.insert(schema.catalogProgram).values({
      snapshotId,
      programId: "reference-program",
      data: programReferencing(snapshotId, "active-reference-hash", courseId),
    });
    await db.insert(schema.rules).values([
      {
        id: "active-reference-rule",
        kind: "equivalence",
        status: "active",
        data: {
          id: "active-reference-rule",
          kind: "equivalence",
          course: courseId,
          target: "OTHER-SHU 101",
        },
      },
      {
        id: "draft-reference-rule",
        kind: "concurrentPrereq",
        status: "draft",
        data: {
          id: "draft-reference-rule",
          kind: "concurrentPrereq",
          course: "OTHER-SHU 201",
          prereq: "OTHER-SHU 101",
          condition: { course: courseId, minGrade: "B" },
        },
      },
    ]);

    await expect(deleteCourse(db, courseId)).rejects.toMatchObject({
      name: "CourseReferencedError",
      courseId,
      references: ["plan", "program", "rule"],
    } satisfies Partial<CourseReferencedError>);
    expect(
      (await db.select().from(schema.courses).where(eq(schema.courses.id, courseId)))
        .length,
    ).toBe(1);
    expect(
      await db
        .select()
        .from(schema.catalogProgram)
        .where(eq(schema.catalogProgram.snapshotId, snapshotId)),
    ).toHaveLength(1);
  });

  it("rejects deletion when only an inactive plan references the course", async () => {
    const courseId = "REF-SHU 102";
    await upsertCourses(db, [testCourse(courseId)], "test");
    const planUserId = "inactive-course-reference-user";
    await db.insert(schema.users).values({
      id: planUserId,
      email: "inactive-course-reference@nyu.edu",
    });
    await db.insert(schema.plans).values({
      userId: planUserId,
      isActive: false,
      snapshot: {
        ...emptySnapshot(),
        fulfillmentFacts: [],
        placements: [{ courseId, semesterId: "Y2S", allocation: "auto" }],
      },
    });

    await expect(deleteCourse(db, courseId)).rejects.toMatchObject({
      references: ["plan"],
    });
  });

  it("ignores retired program references without deleting versioned rows", async () => {
    const courseId = "REF-SHU 103";
    await upsertCourses(db, [testCourse(courseId)], "test");
    const snapshotId = "retired-reference-snapshot";
    const sourceHash = "retired-reference-hash";
    await db.insert(schema.catalogSnapshot).values({
      id: snapshotId,
      sourceHash,
      status: "retired",
      validationReport: validationReport(snapshotId, sourceHash),
      documentCount: 0,
      courseCount: 0,
      programCount: 1,
      sourceReferenceIds: [],
      externalCourseIds: [],
      unresolvedCourseIds: [],
      completedAt: new Date(),
    });
    await db.insert(schema.catalogProgram).values({
      snapshotId,
      programId: "retired-reference-program",
      data: programReferencing(snapshotId, sourceHash, courseId),
    });

    await deleteCourse(db, courseId);

    expect(
      await db.select().from(schema.courses).where(eq(schema.courses.id, courseId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.catalogProgram)
        .where(eq(schema.catalogProgram.snapshotId, snapshotId)),
    ).toHaveLength(1);
  });
});

function testCourse(id: string): Course {
  return {
    id,
    title: `Test course ${id}`,
    credits: 4,
    department: "Test",
    prereqs: [],
    offered: ["fall"],
    sites: ["shanghai"],
    fulfills: [],
    equivalentTo: [],
    tags: [],
  };
}

function validationReport(
  snapshotId: string,
  sourceHash: string,
): SnapshotValidationReport {
  return {
    summary: {
      snapshotId,
      sourceHash,
      documentCount: 0,
      courseCount: 0,
      programCount: 1,
      sourceRowCount: 1,
      requirementRowCount: 1,
    },
    errors: [],
    warnings: [],
  };
}

function programReferencing(
  snapshotId: string,
  sourceHash: string,
  courseId: string,
): CatalogProgram {
  const sourceUrl =
    "https://bulletins.nyu.edu/undergraduate/shanghai/programs/reference-program/";
  return {
    id: "reference-program",
    name: "Reference Program",
    shortName: "REF",
    type: "major",
    categories: [
      {
        id: "required-course",
        name: "Required Course",
        requirement: { kind: "course", courseId },
        sourceUrl,
        sourceTableId: "requirements",
        sourceRowIndexes: [0],
      },
    ],
    requirementRows: [
      {
        sourceUrl,
        tableId: "requirements",
        sourceIndex: 0,
        sourceText: courseId,
        categoryId: "required-course",
        nodePath: [],
        node: { kind: "course", courseId },
      },
    ],
    sourceRows: [],
    sourceReferenceIds: [courseId],
    provenance: { sourceUrl, snapshotId, sourceHash },
  };
}
