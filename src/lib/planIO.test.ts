// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  downloadPlanJson,
  exportPlan,
  parsePlan,
  parsePlanDocument,
} from "@/lib/planIO";

const basePlan = {
  version: 1,
  placements: [
    {
      courseId: "TEST-SHU 997",
      semesterId: "Y1F",
      allocation: "auto",
      selectedCredits: 3,
      expectedGrade: "A-",
    },
  ],
  studyAway: {},
  completedSemesters: [],
  activePrograms: ["core"],
  customCourses: [
    {
      id: "TEST-SHU 997",
      title: "Independent Study",
      credits: 4,
      minCredits: 2,
      maxCredits: 4,
      department: "TEST-SHU",
      prereqs: [],
      offered: [],
      offeringKnown: false,
      sites: ["shanghai"],
      fulfills: [],
      equivalentTo: [],
      attributes: [],
      tags: [],
    },
  ],
  fulfillmentFacts: [
    {
      id: "advisor-waiver",
      kind: "waiver",
      requirementId: "core/algorithmic-thinking",
      label: "Advisor-approved waiver",
    },
  ],
  dismissedWarnings: [],
  startYear: 2026,
};

describe("parsePlan", () => {
  it("preserves expected grades, selected credits, and fulfillment facts", () => {
    const parsed = parsePlan(JSON.stringify(basePlan));

    expect(parsed.placements).toEqual(basePlan.placements);
    expect(parsed.fulfillmentFacts).toEqual(basePlan.fulfillmentFacts);
  });

  it("defaults missing fulfillment facts in a legacy snapshot", () => {
    const legacyPlan = { ...basePlan, fulfillmentFacts: undefined };

    expect(parsePlan(JSON.stringify(legacyPlan)).fulfillmentFacts).toEqual([]);
  });

  it.each([-1, 19])("rejects out-of-range selected credits: %s", (selectedCredits) => {
    const plan = {
      ...basePlan,
      placements: [{ ...basePlan.placements[0], selectedCredits }],
    };

    expect(() => parsePlan(JSON.stringify(plan))).toThrow();
  });

  it("retains unknown course and program references structurally", () => {
    const parsed = parsePlanDocument(JSON.stringify({
      ...basePlan,
      placements: [{ courseId: "UNKNOWN 1", semesterId: "Y1F", allocation: "auto" }],
      activePrograms: ["unknown-program"],
    }));
    expect(parsed.version).toBe(1);
    if (parsed.version === 1) {
      expect(parsed.placements[0].courseId).toBe("UNKNOWN 1");
      expect(parsed.activePrograms).toEqual(["unknown-program"]);
    }
  });

  it("parses and exports plan v2 with source-scoped placement identity", () => {
    const v2 = {
      version: 2 as const,
      catalogReleaseId: "release",
      placements: [{
        placementId: "placement-1",
        courseId: "TEST-UA 1",
        catalogCourseId: "stern:TEST-UA 1",
        titleSnapshot: "Test",
        semesterId: "Y1F" as const,
        allocation: "auto",
      }],
      studyAway: {}, completedSemesters: [],
      programProfile: { coreProgramId: "core", primaryMajorId: "cs", secondMajorId: null, minorIds: [] },
      unresolvedProgramIds: ["unknown"], customCourses: [], fulfillmentFacts: [],
      requirementStatusOverrides: [
        { programId: "cs", categoryId: "electives", status: "planned" as const },
      ],
      dismissedWarnings: [], startYear: 2026,
    };
    expect(parsePlanDocument(exportPlan(v2))).toEqual(v2);
  });

  it("defaults missing requirement status overrides in older v2 exports", () => {
    const legacyV2 = {
      version: 2 as const,
      catalogReleaseId: "release",
      placements: [], studyAway: {}, completedSemesters: [],
      programProfile: { coreProgramId: "core", primaryMajorId: "cs", secondMajorId: null, minorIds: [] },
      unresolvedProgramIds: [], customCourses: [], fulfillmentFacts: [],
      dismissedWarnings: [], startYear: 2026,
    };

    const parsed = parsePlanDocument(JSON.stringify(legacyV2));
    expect(parsed.version).toBe(2);
    if (parsed.version === 2) expect(parsed.requirementStatusOverrides).toEqual([]);
  });

  it("rejects unknown document versions", () => {
    expect(() => parsePlanDocument(JSON.stringify({ version: 3 }))).toThrow();
  });

  it("names JSON backups by entry year", () => {
    const createObjectURL = URL.createObjectURL = vi.fn(() => "blob:plan");
    const revokeObjectURL = URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const v2 = {
      version: 2 as const,
      catalogReleaseId: null,
      placements: [], studyAway: {}, completedSemesters: [],
      programProfile: { coreProgramId: "core", primaryMajorId: "cs", secondMajorId: null, minorIds: [] },
      unresolvedProgramIds: [], customCourses: [], fulfillmentFacts: [], dismissedWarnings: [], startYear: 2027,
      requirementStatusOverrides: [],
    };

    downloadPlanJson(v2, 2027);

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe("nyush-degree-plan-2027.json");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:plan");
    click.mockRestore();
  });
});
