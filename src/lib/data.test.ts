import { describe, expect, it } from "vitest";
import {
  BULLETIN_PROGRAMS,
  CATALOG_FALLBACK,
  COURSES,
  COURSES_BY_ID,
  HOME_SITE,
  PROGRAMS,
  PROGRAMS_BY_ID,
} from "@/lib/data";

describe("generated catalog fallback", () => {
  it("loads a non-empty official Bulletin snapshot", () => {
    expect(CATALOG_FALLBACK.snapshot.kind).toBe("bulletin");
    expect(CATALOG_FALLBACK.snapshot.id).toMatch(/^bulletin-/);
    expect(CATALOG_FALLBACK.snapshot.sourceHash).not.toBe("");
    expect(COURSES.length).toBeGreaterThan(0);
    expect(BULLETIN_PROGRAMS.length).toBeGreaterThan(0);
    expect(HOME_SITE.id).toBe("shanghai");
  });

  it("keeps the legacy program compatibility view empty for Bulletin data", () => {
    expect(PROGRAMS).toEqual([]);
    expect(PROGRAMS_BY_ID.size).toBe(0);
  });

  it("contains major, minor, and Core program types", () => {
    const types = new Set(BULLETIN_PROGRAMS.map((program) => program.type));

    expect(types).toEqual(new Set(["major", "minor", "core"]));
    expect(BULLETIN_PROGRAMS.some((program) => program.id === "core")).toBe(
      true,
    );
  });

  it("keeps every entity provenance on the fallback snapshot", () => {
    const snapshotId = CATALOG_FALLBACK.snapshot.id;

    expect(
      COURSES.every((course) => course.provenance?.snapshotId === snapshotId),
    ).toBe(true);
    expect(
      BULLETIN_PROGRAMS.every(
        (program) => program.provenance.snapshotId === snapshotId,
      ),
    ).toBe(true);
  });

  it("resolves every local executable prerequisite", () => {
    const missingPrerequisites = COURSES.flatMap((course) =>
      course.prereqs.flat().filter((courseId) => !COURSES_BY_ID.has(courseId)),
    );

    expect(
      missingPrerequisites.every(
        (courseId) => !courseId.split(/\s+/, 1)[0].endsWith("-SHU"),
      ),
    ).toBe(true);
  });

  it("preserves rich official course descriptions and credit ranges", () => {
    expect(COURSES.some((course) => Boolean(course.description))).toBe(true);
    expect(
      COURSES.every(
        (course) =>
          (course.minCredits ?? course.credits) <=
          (course.maxCredits ?? course.credits),
      ),
    ).toBe(true);
  });
});
