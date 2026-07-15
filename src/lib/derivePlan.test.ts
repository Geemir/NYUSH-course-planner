import { describe, expect, it } from "vitest";
import {
  deriveFeasibility,
  derivePlan,
  type PlanDerivationInput,
} from "@/lib/derivePlan";
import type { PlannerProgram } from "@/lib/requirements";
import type { Course, Placement } from "@/lib/types";

const PROGRAM: PlannerProgram = {
  id: "humanities",
  name: "Humanities (BA)",
  shortName: "Humanities",
  type: "major",
  color: "#57068c",
  categories: [
    {
      id: "foundation",
      name: "Foundation",
      isCapstone: false,
      rule: { kind: "allOf", courses: ["HUMA-SHU 101"] },
    },
  ],
};

function course(
  id: string,
  credits: number,
  offered: Course["offered"] = ["fall", "spring"],
): Course {
  return {
    id,
    title: id,
    credits,
    department: "HUMA-SHU",
    prereqs: [],
    offered,
    sites: ["shanghai"],
    fulfills:
      id === "HUMA-SHU 101"
        ? [{ programId: "humanities", categoryId: "foundation" }]
        : [],
    equivalentTo: [],
    attributes: [],
    tags: [],
  };
}

const COURSES = [
  { ...course("HUMA-SHU 101", 4, ["spring"]), minCredits: 2, maxCredits: 8 },
  course("HUMA-SHU 102", 4),
  course("HUMA-SHU 103", 4),
  course("HUMA-SHU 104", 2),
];

const PLACEMENTS: Placement[] = [
  {
    courseId: "HUMA-SHU 101",
    semesterId: "Y1F",
    allocation: "auto",
    selectedCredits: 6,
  },
  { courseId: "HUMA-SHU 102", semesterId: "Y1F", allocation: "auto" },
  { courseId: "HUMA-SHU 103", semesterId: "Y1F", allocation: "auto" },
  { courseId: "HUMA-SHU 104", semesterId: "Y1F", allocation: "auto" },
];

const FIXTURE_INPUT: PlanDerivationInput = {
  placements: PLACEMENTS,
  studyAway: {},
  completedSemesters: [],
  activePrograms: ["humanities"],
  fulfillmentFacts: [],
  dismissedWarningIds: [],
  coursesById: new Map(COURSES.map((item) => [item.id, item])),
  customIds: new Set<string>(),
  specialRules: [],
  programs: [PROGRAM],
  homeSiteId: "shanghai",
  siteNameById: new Map([["shanghai", "NYU Shanghai"]]),
};

describe("plan derivation", () => {
  it("derives shared plan state without eagerly computing feasibility", () => {
    const derived = derivePlan(FIXTURE_INPUT);

    expect(derived.creditsBySemester.get("Y1F")).toBe(16);
    expect(derived.warnings.some((warning) => warning.kind === "not-offered")).toBe(
      true,
    );
    expect(derived.activeProgramObjs.map((program) => program.id)).toEqual([
      "humanities",
    ]);
    expect("feasibility" in derived).toBe(false);
  });

  it("computes feasibility only through the dedicated derivation", () => {
    const derived = derivePlan(FIXTURE_INPUT);
    expect(deriveFeasibility(FIXTURE_INPUT, derived).status).toBe("complete");
  });
});
