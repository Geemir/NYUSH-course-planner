import { describe, expect, it } from "vitest";
import { classifyCourseLevel } from "@/lib/bulletin/classifyCourse";
import type { SourceCourse } from "@/lib/bulletin/parseCoursePage";

function course(overrides: Partial<SourceCourse> = {}): SourceCourse {
  return {
    sourceId: "nyu-new-york-arts-science",
    code: "MYSTERY 101",
    title: "Topics",
    linkedCourseIds: [],
    attributes: [],
    detailTexts: [],
    ...overrides,
  };
}

describe("classifyCourseLevel", () => {
  it("prefers explicit undergraduate and graduate Bulletin labels", () => {
    expect(
      classifyCourseLevel(course({ code: "CSCI-GA 1001", levelText: "Undergraduate" })),
    ).toMatchObject({ level: "undergraduate", reason: "explicit-level" });
    expect(
      classifyCourseLevel(course({ code: "CSCI-UA 101", levelText: "Graduate" })),
    ).toMatchObject({ level: "graduate", reason: "explicit-level" });
  });

  it.each([
    ["CSCI-UA 101", "undergraduate"],
    ["ACCT-UB 1", "undergraduate"],
    ["CS-UY 1114", "undergraduate"],
    ["APSY-UE 20", "undergraduate"], // Steinhardt / CEHD
    ["FMTV-UT 1010", "undergraduate"], // Tisch
    ["IDSEM-UG 1001", "undergraduate"], // Gallatin
    ["SOCWK-US 101", "undergraduate"], // Silver Social Work
    ["DHY-UD 101", "undergraduate"], // Dentistry (dental hygiene)
    ["UPADM-GP 101", "undergraduate"], // Wagner undergrad subject, shared -GP suffix
    ["UGPH-GU 10", "undergraduate"], // GPH undergrad subject, shared -GU suffix
    ["CSCI-GA 1001", "graduate"],
    ["ACCT-GB 2301", "graduate"],
    ["CS-GY 6003", "graduate"],
    ["MPATE-GE 2610", "graduate"], // Steinhardt graduate
    ["ITPG-GT 2000", "graduate"], // Tisch graduate
    ["SOCWK-GS 2001", "graduate"], // Silver graduate
  ] as const)("classifies tested New York code convention %s", (code, level) => {
    expect(classifyCourseLevel(course({ code, levelText: null }))).toMatchObject({
      level,
      reason: "tested-code-convention",
    });
  });

  it("keeps suffix-sharing graduate subjects ambiguous rather than guessing", () => {
    // -GP/-GU are only undergraduate for the known undergraduate subjects;
    // other subjects with those suffixes must stay quarantined.
    expect(classifyCourseLevel(course({ code: "HPAM-GP 1830", levelText: null }))).toMatchObject({
      level: "ambiguous",
    });
    expect(classifyCourseLevel(course({ code: "GPH-GU 2106", levelText: null }))).toMatchObject({
      level: "ambiguous",
    });
  });

  it("quarantines unknown conventions and never consults prerequisite prose", () => {
    expect(
      classifyCourseLevel(
        course({
          code: "TOPICS 101",
          levelText: null,
          prerequisiteText: "Graduate standing and CSCI-GA 1001",
        }),
      ),
    ).toEqual({ level: "ambiguous", reason: "no-reliable-level-signal" });
  });
});
