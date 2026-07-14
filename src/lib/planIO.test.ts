import { describe, expect, it } from "vitest";
import { parsePlan } from "@/lib/planIO";

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
});
