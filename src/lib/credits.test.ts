import { describe, expect, it } from "vitest";
import { placementCredits } from "@/lib/credits";
import {
  CourseSchema,
  FulfillmentFactsSchema,
  RequirementNodeSchema,
  RuleSchema,
} from "@/lib/types";
import type { Course, Placement, RequirementNode } from "@/lib/types";

const course: Course = {
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
};

describe("placementCredits", () => {
  it("uses a valid selected credit value", () => {
    const placement: Placement = {
      courseId: course.id,
      semesterId: "Y1F",
      allocation: "auto",
      selectedCredits: 2,
    };
    expect(placementCredits(placement, course)).toBe(2);
  });

  it("falls back to the catalog default outside the range", () => {
    const placement: Placement = {
      courseId: course.id,
      semesterId: "Y1F",
      allocation: "auto",
      selectedCredits: 8,
    };
    expect(placementCredits(placement, course)).toBe(4);
  });
});

describe("bulletin domain schemas", () => {
  const courseNode: RequirementNode = {
    kind: "course",
    courseId: "CSCI-SHU 101",
  };
  const requirementNodes: RequirementNode[] = [
    courseNode,
    { kind: "all", children: [courseNode] },
    { kind: "any", children: [courseNode] },
    { kind: "choose", count: 1, children: [courseNode] },
    { kind: "credits", minimum: 4, children: [courseNode] },
    { kind: "attribute", attribute: "Algorithmic Thinking" },
    {
      kind: "exclusion",
      excludedCourseIds: ["CSCI-SHU 997"],
      child: courseNode,
    },
    { kind: "waiver", waiverId: "placement", label: "Placement exam" },
    {
      kind: "manualConfirmation",
      label: "Advisor approval",
      sourceText: "Approval from the program director is required.",
    },
  ];

  it.each(requirementNodes)("parses the $kind requirement variant", (requirement) => {
    expect(RequirementNodeSchema.parse(requirement)).toEqual(requirement);
  });

  it("rejects an empty offering list when offering is known", () => {
    expect(
      CourseSchema.safeParse({ ...course, offeringKnown: true, offered: [] }).success,
    ).toBe(false);
  });

  it("accepts an empty offering list when offering is unknown", () => {
    expect(
      CourseSchema.parse({ ...course, offeringKnown: false, offered: [] }),
    ).toMatchObject({ offeringKnown: false, offered: [] });
  });

  it("keeps all legacy rule kinds parseable", () => {
    expect(RuleSchema.parse({ kind: "allOf", courses: ["A 1"] })).toEqual({
      kind: "allOf",
      courses: ["A 1"],
    });
    expect(RuleSchema.parse({ kind: "chooseN", n: 1, courses: ["A 1"] })).toEqual({
      kind: "chooseN",
      n: 1,
      courses: ["A 1"],
    });
    expect(
      RuleSchema.parse({ kind: "creditsFrom", minCredits: 4, courses: ["A 1"] }),
    ).toEqual({ kind: "creditsFrom", minCredits: 4, courses: ["A 1"] });
  });

  it("defaults absent fulfillment facts for legacy snapshots", () => {
    expect(FulfillmentFactsSchema.parse(undefined)).toEqual([]);
  });
});
