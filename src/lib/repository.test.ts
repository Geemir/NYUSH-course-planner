import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  deleteCourse,
  emptySnapshot,
  ensureCatalogSeeded,
  getActivePlan,
  getAllCourses,
  saveActivePlan,
  upsertCourses,
  type Db,
} from "@/lib/repository";
import type { Course } from "@/lib/types";

let db: Db;
let userId: string;

beforeAll(async () => {
  const client = new PGlite(); // in-memory
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [user] = await db
    .insert(schema.users)
    .values({ email: "test@nyu.edu" })
    .returning({ id: schema.users.id });
  userId = user.id;
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
});
