import { describe, expect, it } from "vitest";
import {
  COURSES,
  COURSES_BY_ID,
  HOME_SITE,
  PROGRAMS,
  PROGRAMS_BY_ID,
  activeCrossListedMajors,
  isActivelyCrossListed,
  isCrossListed,
} from "@/lib/data";

describe("real course data", () => {
  it("parses and passes referential integrity checks", () => {
    expect(PROGRAMS.map((p) => p.id)).toEqual([
      "core",
      "cs",
      "ima",
      "ds",
      "ima-minor",
    ]);
    expect(COURSES.length).toBeGreaterThanOrEqual(45);
    expect(HOME_SITE.id).toBe("shanghai");
  });

  it("models program types: majors, one core, one minor", () => {
    expect(PROGRAMS_BY_ID.get("cs")!.type).toBe("major");
    expect(PROGRAMS_BY_ID.get("ds")!.type).toBe("major");
    expect(PROGRAMS_BY_ID.get("core")!.type).toBe("core");
    expect(PROGRAMS_BY_ID.get("ima-minor")!.type).toBe("minor");
  });

  it("contains the CS prerequisite chain", () => {
    expect(COURSES_BY_ID.get("CSCI-SHU 210")!.prereqs).toEqual([["CSCI-SHU 101"]]);
    expect(COURSES_BY_ID.get("CSCI-SHU 220")!.prereqs).toContainEqual([
      "CSCI-SHU 210",
    ]);
  });

  it("marks CS/IMA cross-listed courses", () => {
    expect(isCrossListed(COURSES_BY_ID.get("INTM-SHU 152")!)).toBe(true);
    expect(isCrossListed(COURSES_BY_ID.get("CSCI-SHU 235")!)).toBe(true);
  });

  it("cross-listing is active-aware for mutually-exclusive majors", () => {
    // Intro CS fulfills both CS and DS (never tracked together), so it is
    // 'cross-listed' globally but NOT under any single-major plan.
    const introCS = COURSES_BY_ID.get("CSCI-SHU 101")!;
    expect(isCrossListed(introCS)).toBe(true);
    expect(isActivelyCrossListed(introCS, ["core", "cs", "ima"])).toBe(false);
    expect(activeCrossListedMajors(introCS, ["core", "cs", "ima"])).toEqual([
      "cs",
    ]);

    // A genuine CS+IMA course stays cross-listed when both majors are active.
    const ccl = COURSES_BY_ID.get("INTM-SHU 152")!;
    expect(isActivelyCrossListed(ccl, ["core", "cs", "ima"])).toBe(true);

    // InfoVis is DS+IMA cross-listed under a DS+IMA plan.
    const infoViz = COURSES_BY_ID.get("CSCI-SHU 235")!;
    expect(isActivelyCrossListed(infoViz, ["core", "ds", "ima"])).toBe(true);

    // The IMA minor is not a major, so it never triggers cross-listing.
    expect(isActivelyCrossListed(ccl, ["core", "cs", "ima-minor"])).toBe(false);
  });

  it("has a capstone for each major", () => {
    expect(COURSES_BY_ID.get("CSCI-SHU 420")!.tags).toContain("capstone");
    expect(COURSES_BY_ID.get("INTM-SHU 450")!.tags).toContain("capstone");
    expect(COURSES_BY_ID.get("DATS-SHU 401")!.tags).toContain("capstone");
  });
});
