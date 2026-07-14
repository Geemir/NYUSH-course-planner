import { describe, expect, it } from "vitest";
import { evaluateRequirement, requirementDemand } from "@/lib/requirements";
import type { Course, FulfillmentFact, Placement, RequirementNode } from "@/lib/types";

function course(id: string, extra: Partial<Course> = {}): Course {
  return {
    id,
    title: id,
    credits: 4,
    department: "Test",
    prereqs: [],
    offered: ["fall", "spring"],
    sites: ["home"],
    fulfills: [],
    equivalentTo: [],
    tags: [],
    ...extra,
  };
}

const courses = [
  course("A", { attributes: ["Core: Science"] }),
  course("B", { minCredits: 2, maxCredits: 4, credits: 4 }),
  course("C", { attributes: ["Core: Science"] }),
  course("ALT", { equivalentTo: ["A"] }),
];
const coursesById = new Map(courses.map((item) => [item.id, item]));

function placement(
  courseId: string,
  semesterId: Placement["semesterId"] = "Y1F",
  selectedCredits?: number,
): Placement {
  return { courseId, semesterId, allocation: "auto", selectedCredits };
}

function evaluate(
  node: RequirementNode,
  placements: Placement[] = [],
  fulfillmentFacts: FulfillmentFact[] = [],
) {
  return evaluateRequirement(node, {
    placements,
    completedSemesters: ["Y1F"],
    coursesById,
    fulfillmentFacts,
  });
}

describe("recursive Bulletin requirement evaluator", () => {
  it("evaluates all children and preserves deterministic missing course IDs", () => {
    const node: RequirementNode = {
      kind: "all",
      children: [
        { kind: "course", courseId: "A" },
        { kind: "course", courseId: "B" },
      ],
    };

    expect(evaluate(node, [placement("ALT")])).toMatchObject({
      requiredUnits: 2,
      plannedUnits: 1,
      completedUnits: 1,
      plannedFraction: 0.5,
      completedFraction: 0.5,
      matchedCourseIds: ["ALT"],
      missingCourseIds: ["B"],
      unitKind: "courses",
      manualState: "none",
    });
    expect(requirementDemand(node)).toEqual({ units: 2, unitKind: "courses" });
  });

  it("treats an unmet any branch as ambiguous instead of inventing a course", () => {
    const node: RequirementNode = {
      kind: "any",
      children: [
        { kind: "course", courseId: "A" },
        { kind: "course", courseId: "B" },
      ],
    };
    const result = evaluate(node);
    expect(result.plannedFraction).toBe(0);
    expect(result.missingCourseIds).toEqual([]);
    expect(result.gaps).toEqual([
      expect.objectContaining({ kind: "ambiguous", candidateCourseIds: ["A", "B"] }),
    ]);
  });

  it("preserves a deterministic missing course when any has one branch", () => {
    expect(
      evaluate({ kind: "any", children: [{ kind: "course", courseId: "A" }] }),
    ).toMatchObject({ missingCourseIds: ["A"], gaps: [] });
  });

  it("keeps planned and completed any progress from their best branches", () => {
    const result = evaluate(
      {
        kind: "any",
        children: [
          {
            kind: "all",
            children: [
              { kind: "course", courseId: "A" },
              { kind: "course", courseId: "B" },
            ],
          },
          { kind: "course", courseId: "C" },
        ],
      },
      [placement("A"), placement("C", "Y1S")],
    );
    expect(result.plannedFraction).toBe(1);
    expect(result.completedFraction).toBe(0.5);
    expect(result.matchedCourseIds).toEqual(["C", "A"]);
  });

  it("evaluates choose by child fulfillment and reports an unresolved choice", () => {
    const node: RequirementNode = {
      kind: "choose",
      count: 2,
      children: [
        { kind: "course", courseId: "A" },
        { kind: "course", courseId: "B" },
        { kind: "course", courseId: "C" },
      ],
    };
    const result = evaluate(node, [placement("A")]);
    expect(result).toMatchObject({
      requiredUnits: 2,
      plannedUnits: 1,
      completedUnits: 1,
      missingCourseIds: [],
      unitKind: "courses",
    });
    expect(result.gaps).toEqual([
      expect.objectContaining({ kind: "ambiguous", candidateCourseIds: ["B", "C"] }),
    ]);
    expect(requirementDemand(node)).toEqual({ units: 2, unitKind: "courses" });
  });

  it("preserves all deterministic leaves when choose requires every child", () => {
    expect(
      evaluate({
        kind: "choose",
        count: 2,
        children: [
          { kind: "course", courseId: "A" },
          { kind: "course", courseId: "B" },
        ],
      }),
    ).toMatchObject({ missingCourseIds: ["A", "B"], gaps: [] });
  });

  it("keeps planned and completed choose progress from their best children", () => {
    const result = evaluate(
      {
        kind: "choose",
        count: 1,
        children: [
          {
            kind: "all",
            children: [
              { kind: "course", courseId: "A" },
              { kind: "course", courseId: "B" },
            ],
          },
          { kind: "course", courseId: "C" },
        ],
      },
      [placement("A"), placement("C", "Y1S")],
    );
    expect(result.plannedFraction).toBe(1);
    expect(result.completedFraction).toBe(0.5);
  });

  it("uses selected variable credits in a credits requirement", () => {
    const node: RequirementNode = {
      kind: "credits",
      minimum: 6,
      children: [
        { kind: "course", courseId: "A" },
        { kind: "course", courseId: "B" },
      ],
    };
    const result = evaluate(node, [placement("A"), placement("B", "Y1S", 2)]);
    expect(result).toMatchObject({
      requiredUnits: 6,
      plannedUnits: 6,
      completedUnits: 4,
      plannedFraction: 1,
      completedFraction: 4 / 6,
      unitKind: "credits",
      matchedCourseIds: ["A", "B"],
    });
    expect(requirementDemand(node)).toEqual({ units: 6, unitKind: "credits" });
  });

  it("matches attribute requirements against real course data", () => {
    expect(evaluate(
      { kind: "attribute", attribute: "Core: Science" },
      [placement("C")],
    )).toMatchObject({
      plannedFraction: 1,
      completedFraction: 1,
      matchedCourseIds: ["C"],
      missingCourseIds: [],
    });
  });

  it("removes excluded placements before evaluating its child", () => {
    const result = evaluate(
      {
        kind: "exclusion",
        excludedCourseIds: ["A"],
        child: { kind: "attribute", attribute: "Core: Science" },
      },
      [placement("A")],
    );
    expect(result.plannedFraction).toBe(0);
    expect(result.matchedCourseIds).toEqual([]);
  });

  it("satisfies waiver and manual nodes only with explicit facts", () => {
    const node: RequirementNode = {
      kind: "all",
      children: [
        { kind: "waiver", waiverId: "math-placement", label: "Math placement" },
        {
          kind: "manualConfirmation",
          label: "Advisor approval",
          sourceText: "Approval from the program director is required.",
        },
      ],
    };
    const facts: FulfillmentFact[] = [
      { id: "w1", kind: "waiver", requirementId: "math-placement", label: "Placed out" },
      {
        id: "m1",
        kind: "manualConfirmation",
        requirementId: "Approval from the program director is required.",
        label: "Approved",
      },
    ];
    expect(evaluate(node)).toMatchObject({
      plannedFraction: 0,
      completedFraction: 0,
      manualState: "pending",
      gaps: [
        expect.objectContaining({ kind: "waiver" }),
        expect.objectContaining({ kind: "manual" }),
      ],
    });
    expect(evaluate(node, [], facts)).toMatchObject({
      plannedFraction: 1,
      completedFraction: 1,
      manualState: "satisfied",
      gaps: [],
    });
  });

  it("does not mutate the requirement or context collections", () => {
    const node: RequirementNode = {
      kind: "all",
      children: [{ kind: "course", courseId: "A" }],
    };
    const placements = [placement("A")];
    const nodeBefore = structuredClone(node);
    const placementsBefore = structuredClone(placements);
    const keysBefore = [...coursesById.keys()];
    evaluate(node, placements);
    expect(node).toEqual(nodeBefore);
    expect(placements).toEqual(placementsBefore);
    expect([...coursesById.keys()]).toEqual(keysBefore);
  });
});
