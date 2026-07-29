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
  getActivePlanEnvelope,
  getAllCourses,
  saveActivePlan,
  saveActivePlanRevision,
  upsertCourses,
  upsertRule,
  type Db,
} from "@/lib/repository";
import type { SnapshotValidationReport } from "@/lib/bulletin/validateSnapshot";
import type { CatalogProgram, Course, PlanSnapshotV2 } from "@/lib/types";

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

describe("revision-aware plan repository", () => {
  const v2 = (startYear: number): PlanSnapshotV2 => ({
    version: 2,
    catalogReleaseId: "release",
    placements: [],
    planningSlots: [
      {
        id: "slot-elective",
        sourceKey: "cs/sample/0/0",
        semesterId: "Y1F",
        label: "General Elective",
        credits: 4,
        source: {
          kind: "bulletin-sample-plan",
          programId: "cs",
          catalogReleaseId: "release",
          sectionId: "sampleplanofstudytext",
          termSourceIndex: 0,
          rowSourceIndex: 0,
        },
      },
    ],
    studyAway: {},
    completedSemesters: [],
    programProfile: {
      coreProgramId: "core",
      primaryMajorId: "cs",
      secondMajorId: null,
      minorIds: [],
    },
    unresolvedProgramIds: [],
    customCourses: [],
    fulfillmentFacts: [],
    dismissedWarnings: [],
    startYear,
  });

  it("inserts revision 1, increments matching updates, and preserves stale conflicts", async () => {
    const isolated = await isolatedRepository();
    try {
      await isolated.db.insert(schema.users).values({ id: "revision-user", email: "revision@nyu.edu" });
      const first = await saveActivePlanRevision(isolated.db, "revision-user", v2(2026), null);
      expect(first).toMatchObject({ status: "saved", plan: { revision: 1, snapshot: { startYear: 2026 } } });
      expect(first.status === "saved" && first.plan.snapshot.version === 2
        ? first.plan.snapshot.planningSlots
        : []).toHaveLength(1);
      const second = await saveActivePlanRevision(isolated.db, "revision-user", v2(2027), 1);
      expect(second).toMatchObject({ status: "saved", plan: { revision: 2, snapshot: { startYear: 2027 } } });
      const stale = await saveActivePlanRevision(isolated.db, "revision-user", v2(2030), 1);
      expect(stale).toMatchObject({ status: "conflict", server: { revision: 2, snapshot: { startYear: 2027 } } });
      expect(await getActivePlanEnvelope(isolated.db, "revision-user")).toMatchObject({ revision: 2, snapshot: { startYear: 2027 } });
    } finally {
      await isolated.client.close();
    }
  });

  it("isolates users and reads a v1 row verbatim at revision 1", async () => {
    const isolated = await isolatedRepository();
    try {
      await isolated.db.insert(schema.users).values([
        { id: "v1-user", email: "v1@nyu.edu" },
        { id: "other-user", email: "other@nyu.edu" },
      ]);
      const legacy = { ...emptySnapshot(), fulfillmentFacts: [], activePrograms: ["core", "unknown"], startYear: 2024 };
      await isolated.db.insert(schema.plans).values({ userId: "v1-user", snapshot: legacy });
      expect(await getActivePlanEnvelope(isolated.db, "v1-user")).toMatchObject({
        revision: 1,
        snapshot: { version: 1, activePrograms: ["core", "unknown"], startYear: 2024 },
      });
      expect(await getActivePlanEnvelope(isolated.db, "other-user")).toBeNull();
      const replaced = await saveActivePlanRevision(isolated.db, "v1-user", v2(2028), 1);
      expect(replaced).toMatchObject({ status: "saved", plan: { revision: 2, snapshot: { version: 2, startYear: 2028 } } });
    } finally {
      await isolated.client.close();
    }
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

    const snapshotId = await ensureActiveReferenceSnapshot(db);
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

  it("rejects deletion for an active program source-only reference", async () => {
    const courseId = "REF-SHU 104";
    await upsertCourses(db, [testCourse(courseId)], "test");
    const snapshotId = await ensureActiveReferenceSnapshot(db);
    await db.insert(schema.catalogProgram).values({
      snapshotId,
      programId: "source-only-reference-program",
      data: programWithSourceOnlyReference(
        snapshotId,
        "active-reference-hash",
        courseId,
      ),
    });

    await expect(deleteCourse(db, courseId)).rejects.toMatchObject({
      references: ["program"],
    });
    expect(
      await db.select().from(schema.courses).where(eq(schema.courses.id, courseId)),
    ).toHaveLength(1);
  });

  it("fails closed when a persisted plan snapshot is schema-invalid", async () => {
    const courseId = "MALFORMED-PLAN-SHU 101";
    const planId = "malformed-plan-reference";
    await upsertCourses(db, [testCourse(courseId)], "test");
    await db.insert(schema.plans).values({
      id: planId,
      userId,
      isActive: false,
      snapshot: {
        ...emptySnapshot(),
        version: 2,
      } as never,
    });

    try {
      await expect(deleteCourse(db, courseId)).rejects.toThrow();
      expect(
        await db
          .select()
          .from(schema.courses)
          .where(eq(schema.courses.id, courseId)),
      ).toHaveLength(1);
    } finally {
      await db.delete(schema.plans).where(eq(schema.plans.id, planId));
    }
  });

  it("fails closed when an active persisted program is schema-invalid", async () => {
    const courseId = "MALFORMED-PROGRAM-SHU 101";
    const snapshotId = await ensureActiveReferenceSnapshot(db);
    const programId = "malformed-active-program";
    await upsertCourses(db, [testCourse(courseId)], "test");
    await db.insert(schema.catalogProgram).values({
      snapshotId,
      programId,
      data: {
        ...programWithSourceOnlyReference(snapshotId, "active-reference-hash", ""),
        type: "certificate",
        sourceReferenceIds: [],
      } as never,
    });

    try {
      await expect(deleteCourse(db, courseId)).rejects.toThrow();
      expect(
        await db
          .select()
          .from(schema.courses)
          .where(eq(schema.courses.id, courseId)),
      ).toHaveLength(1);
    } finally {
      await db
        .delete(schema.catalogProgram)
        .where(
          and(
            eq(schema.catalogProgram.snapshotId, snapshotId),
            eq(schema.catalogProgram.programId, programId),
          ),
        );
    }
  });

  it("fails closed when a persisted shared rule is schema-invalid", async () => {
    const courseId = "MALFORMED-RULE-SHU 101";
    const ruleId = "malformed-shared-rule";
    await upsertCourses(db, [testCourse(courseId)], "test");
    await db.insert(schema.rules).values({
      id: ruleId,
      kind: "futureRule",
      status: "draft",
      data: { id: ruleId, kind: "futureRule" } as never,
    });

    try {
      await expect(deleteCourse(db, courseId)).rejects.toThrow();
      expect(
        await db
          .select()
          .from(schema.courses)
          .where(eq(schema.courses.id, courseId)),
      ).toHaveLength(1);
    } finally {
      await db.delete(schema.rules).where(eq(schema.rules.id, ruleId));
    }
  });

  it("rejects plan writes whose course reference has no catalog target", async () => {
    const missingCourseId = "MISSING-PLAN-SHU 101";
    const missingUserId = "missing-plan-reference-user";
    await db.insert(schema.users).values({
      id: missingUserId,
      email: "missing-plan-reference@nyu.edu",
    });

    await expect(
      saveActivePlan(db, missingUserId, {
        ...emptySnapshot(),
        placements: [
          { courseId: missingCourseId, semesterId: "Y1F", allocation: "auto" },
        ],
      }),
    ).rejects.toThrow(/missing.*course/i);
    expect(
      await db
        .select()
        .from(schema.plans)
        .where(eq(schema.plans.userId, missingUserId)),
    ).toHaveLength(0);
  });

  it("rejects rule writes whose course reference has no catalog target", async () => {
    const missingCourseId = "MISSING-RULE-SHU 101";

    await expect(
      upsertRule(
        db,
        {
          id: "missing-course-reference-rule",
          kind: "equivalence",
          course: missingCourseId,
          target: missingCourseId,
        },
        "draft",
      ),
    ).rejects.toThrow(/missing.*course/i);
    expect(
      await db
        .select()
        .from(schema.rules)
        .where(eq(schema.rules.id, "missing-course-reference-rule")),
    ).toHaveLength(0);
  });

  it("allows a plan reference to an active snapshot-only course", async () => {
    const courseId = "SNAPSHOT-ONLY-SHU 101";
    const snapshotId = await ensureActiveReferenceSnapshot(db);
    const snapshotUserId = "snapshot-only-reference-user";
    const snapshotCourse = testCourse(courseId);
    await db.insert(schema.catalogCourse).values({
      snapshotId,
      courseId,
      stableId: `nyu-shanghai:${courseId}`,
      sourceId: "nyu-shanghai",
      code: courseId,
      subject: snapshotCourse.department,
      title: snapshotCourse.title,
      minCredits: snapshotCourse.minCredits ?? snapshotCourse.credits,
      maxCredits: snapshotCourse.maxCredits ?? snapshotCourse.credits,
      level: "undergraduate",
      catalogOfferingTerms: snapshotCourse.offered,
      searchText: `${courseId} ${snapshotCourse.title}`.toLowerCase(),
      data: snapshotCourse,
    });
    await db.insert(schema.users).values({
      id: snapshotUserId,
      email: "snapshot-only-reference@nyu.edu",
    });

    await saveActivePlan(db, snapshotUserId, {
      ...emptySnapshot(),
      placements: [{ courseId, semesterId: "Y1S", allocation: "auto" }],
    });

    expect(
      await db
        .select()
        .from(schema.plans)
        .where(eq(schema.plans.userId, snapshotUserId)),
    ).toHaveLength(1);
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

  it("prevents a delete-first race from committing a dangling plan reference", async () => {
    const { client, db: raceDb } = await isolatedRepository();
    const courseId = "RACE-PLAN-SHU 101";
    const raceUserId = "race-plan-user";
    try {
      await raceDb
        .insert(schema.users)
        .values({ id: raceUserId, email: "race-plan@nyu.edu" });
      await upsertCourses(raceDb, [testCourse(courseId)], "test");
      const snapshot = {
        ...emptySnapshot(),
        placements: [{ courseId, semesterId: "Y1F" as const, allocation: "auto" }],
      };

      const [deletion, save] = await Promise.allSettled([
        deleteCourse(raceDb, courseId),
        saveActivePlan(raceDb, raceUserId, snapshot),
      ]);

      expect(deletion.status).toBe("fulfilled");
      expect(save.status).toBe("rejected");
      expect(
        await raceDb
          .select()
          .from(schema.courses)
          .where(eq(schema.courses.id, courseId)),
      ).toHaveLength(0);
      expect(
        await raceDb
          .select()
          .from(schema.plans)
          .where(eq(schema.plans.userId, raceUserId)),
      ).toHaveLength(0);
    } finally {
      await client.close();
    }
  });

  it("prevents a delete-first race from committing a dangling rule reference", async () => {
    const { client, db: raceDb } = await isolatedRepository();
    const courseId = "RACE-RULE-SHU 101";
    try {
      await upsertCourses(raceDb, [testCourse(courseId)], "test");
      const rule = {
        id: "race-reference-rule",
        kind: "equivalence" as const,
        course: courseId,
        target: courseId,
      };

      const [deletion, save] = await Promise.allSettled([
        deleteCourse(raceDb, courseId),
        upsertRule(raceDb, rule, "draft"),
      ]);

      expect(deletion.status).toBe("fulfilled");
      expect(save.status).toBe("rejected");
      expect(
        await raceDb
          .select()
          .from(schema.courses)
          .where(eq(schema.courses.id, courseId)),
      ).toHaveLength(0);
      expect(await raceDb.select().from(schema.rules)).toHaveLength(0);
    } finally {
      await client.close();
    }
  });
});

async function isolatedRepository(): Promise<{
  client: PGlite;
  db: Db;
}> {
  const client = new PGlite();
  const isolatedDb = drizzle(client, { schema });
  await migrate(isolatedDb, { migrationsFolder: "./drizzle" });
  return { client, db: isolatedDb };
}

async function ensureActiveReferenceSnapshot(targetDb: Db): Promise<string> {
  const snapshotId = "active-reference-snapshot";
  await targetDb
    .insert(schema.catalogSnapshot)
    .values({
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
    })
    .onConflictDoNothing();
  return snapshotId;
}

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
    auditAuthority: "nyush-bulletin",
    eligibleProfileRoles: ["primaryMajor", "secondMajor"],
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

function programWithSourceOnlyReference(
  snapshotId: string,
  sourceHash: string,
  courseId: string,
): CatalogProgram {
  const program = programReferencing(snapshotId, sourceHash, courseId);
  const manual = {
    kind: "manualConfirmation" as const,
    label: "Manual review",
    sourceText: "Advisor confirmation required",
  };
  return {
    ...program,
    id: "source-only-reference-program",
    categories: program.categories.map((category) => ({
      ...category,
      requirement: manual,
    })),
    requirementRows: program.requirementRows.map((row) => ({
      ...row,
      node: manual,
    })),
    sourceReferenceIds: courseId ? [courseId] : [],
  };
}
