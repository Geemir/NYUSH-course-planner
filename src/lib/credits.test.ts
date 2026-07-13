import { describe, expect, it } from "vitest";
import { placementCredits } from "@/lib/credits";
import {
  FulfillmentFactsSchema,
  RequirementNodeSchema,
  RuleSchema,
} from "@/lib/types";
import type { Course, Placement } from "@/lib/types";

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
  it("parses recursive requirement nodes", () => {
    const requirement = {
      kind: "all" as const,
      children: [
        { kind: "course" as const, courseId: "CSCI-SHU 101" },
        {
          kind: "choose" as const,
          count: 1,
          children: [
            { kind: "attribute" as const, attribute: "Algorithmic Thinking" },
            { kind: "waiver" as const, waiverId: "placement", label: "Placement exam" },
          ],
        },
      ],
    };

    expect(RequirementNodeSchema.parse(requirement)).toEqual(requirement);
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
