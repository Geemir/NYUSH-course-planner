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
    ["CSCI-GA 1001", "graduate"],
    ["ACCT-GB 2301", "graduate"],
    ["CS-GY 6003", "graduate"],
  ] as const)("classifies tested New York code convention %s", (code, level) => {
    expect(classifyCourseLevel(course({ code, levelText: null }))).toMatchObject({
      level,
      reason: "tested-code-convention",
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
