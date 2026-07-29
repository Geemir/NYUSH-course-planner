import { describe, expect, it } from "vitest";
import { derivePlan } from "@/lib/derivePlan";
import { FIXTURE_PROGRAMS, mkCourse } from "@/lib/fixtures.test-helper";
import { buildPlanExportModel, planExportFilename } from "@/lib/planExport/model";
import { SEMESTER_IDS, type PlanSnapshotV2 } from "@/lib/types";

function exportFixture() {
  const intro = mkCourse({
    id: "CSCI-SHU 101",
    title: "Introduction to Computer Science",
    credits: 4,
    minCredits: 2,
    maxCredits: 4,
    sites: ["shanghai"],
    fulfills: [{ programId: "core", categoryId: "core-math" }],
  });
  const placements = [
    {
      placementId: "placement-1",
      courseId: intro.id,
      catalogCourseId: "nyu-shanghai:CSCI-SHU 101",
      titleSnapshot: intro.title,
      semesterId: "Y1F" as const,
      allocation: "auto",
      selectedCredits: 3,
      expectedGrade: "A-" as const,
    },
    {
      placementId: "placement-2",
      courseId: "UNRESOLVED-UA 1",
      titleSnapshot: "Unresolved Seminar",
      semesterId: "Y1S" as const,
      allocation: "auto",
    },
    {
      placementId: "placement-3",
      courseId: "UNKNOWN-UA 2",
      semesterId: "Y2F" as const,
      allocation: "auto",
    },
  ];
  const snapshot: PlanSnapshotV2 = {
    version: 2,
    catalogReleaseId: "release-2026",
    placements,
    planningSlots: [{
      id: "slot-1", sourceKey: "cs:sample:1:2:general-elective", semesterId: "Y1F",
      label: "General Elective", credits: 4,
      source: { kind: "bulletin-sample-plan", programId: "computer-science-bs", catalogReleaseId: "release-2026", sectionId: "sample", termSourceIndex: 0, rowSourceIndex: 2 },
    }],
    studyAway: { Y1F: "newyork", Y2S: "future-campus" },
    completedSemesters: ["Y1F"],
    programProfile: {
      coreProgramId: "core",
      primaryMajorId: "a",
      secondMajorId: "b",
      minorIds: ["m"],
    },
    unresolvedProgramIds: [],
    customCourses: [],
    fulfillmentFacts: [],
    requirementStatusOverrides: [{ programId: "core", categoryId: "core-math", status: "planned" }],
    dismissedWarnings: [],
    startYear: 2025,
  };
  const coursesById = new Map([[intro.id, intro]]);
  const derived = derivePlan({
    placements,
    studyAway: snapshot.studyAway,
    completedSemesters: snapshot.completedSemesters,
    activePrograms: ["core", "a", "b", "m"],
    fulfillmentFacts: [],
    requirementStatusOverrides: snapshot.requirementStatusOverrides,
    dismissedWarningIds: [],
    coursesById,
    customIds: new Set(),
    specialRules: [],
    programs: FIXTURE_PROGRAMS,
    homeSiteId: "shanghai",
    siteNameById: new Map([
      ["shanghai", "NYU Shanghai"],
      ["newyork", "NYU New York"],
    ]),
  });
  return { snapshot, derived };
}

describe("buildPlanExportModel", () => {
  it("builds a chronological, serializable advising view", () => {
    const { snapshot, derived } = exportFixture();
    const model = buildPlanExportModel(snapshot, derived, new Date("2026-07-29T00:00:00.000Z"));

    expect(model.generatedAt).toBe("2026-07-29T00:00:00.000Z");
    expect(model.semesters.map(({ id }) => id)).toEqual(SEMESTER_IDS);
    expect(model.semesters[0]).toMatchObject({
      academicYear: "2025–26",
      term: "Fall 2025",
      site: "NYU New York",
      completed: true,
      credits: 3,
    });
    expect(model.semesters[0].courses[0]).toMatchObject({
      code: "CSCI-SHU 101",
      title: "Introduction to Computer Science",
      credits: 3,
      expectedGrade: "A-",
    });
    expect(model.semesters[0].slots).toEqual([{ label: "General Elective", credits: 4, sourceProgramId: "computer-science-bs", tentative: true }]);
    expect(model.credits.planned).toBe(3);
    expect(model.profile.map(({ role }) => role)).toEqual([
      "core",
      "primary-major",
      "second-major",
      "minor",
    ]);
    expect(model.requirements[0]).toMatchObject({ unitKind: "courses" });
    expect(model.requirements.find((item) => item.programId === "core" && item.categoryId === "core-math")).toMatchObject({
      statusSource: "manual", manualStatus: "planned", status: "planned",
    });
    expect(model.warnings.some(({ message }) => message.includes("NYU New York"))).toBe(true);
    expect(model.disclaimer).toMatch(/planning guidance/i);
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
  });

  it("falls back to snapshot titles, course codes, and unknown site ids", () => {
    const { snapshot, derived } = exportFixture();
    const model = buildPlanExportModel(snapshot, derived);

    expect(model.semesters[1].courses[0]).toMatchObject({
      code: "UNRESOLVED-UA 1",
      title: "Unresolved Seminar",
      resolved: false,
    });
    expect(model.semesters[2].courses[0]).toMatchObject({
      code: "UNKNOWN-UA 2",
      title: "UNKNOWN-UA 2",
      resolved: false,
    });
    expect(model.semesters[3].site).toBe("future-campus");
  });

  it("creates stable format-specific filenames", () => {
    const { snapshot, derived } = exportFixture();
    const model = buildPlanExportModel(snapshot, derived);

    expect(planExportFilename(model, "json")).toBe("nyush-degree-plan-2025.json");
    expect(planExportFilename(model, "xlsx")).toBe("nyush-degree-plan-2025.xlsx");
    expect(planExportFilename(model, "pdf")).toBe("nyush-degree-plan-2025.pdf");
  });
});
