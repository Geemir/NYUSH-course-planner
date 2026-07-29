import { describe, expect, it } from "vitest";
import {
  deriveFeasibility,
  derivePlan,
  type PlanDerivationInput,
} from "@/lib/derivePlan";
import type { PlannerProgram } from "@/lib/requirements";
import { CatalogProgramSchema, type Course, type Placement } from "@/lib/types";

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

  it("keeps source-scoped placements distinct while engines use official code and selected credits", () => {
    const placements = [
      { placementId: "cas", catalogCourseId: "cas:HUMA-SHU 101", courseId: "HUMA-SHU 101", semesterId: "Y1F" as const, allocation: "auto" as const, selectedCredits: 3 },
      { placementId: "stern", catalogCourseId: "stern:HUMA-SHU 101", courseId: "HUMA-SHU 101", semesterId: "Y1S" as const, allocation: "auto" as const, selectedCredits: 2 },
    ];
    const derived = derivePlan({ ...FIXTURE_INPUT, placements });
    expect(derived.placementByCatalogId.get("cas:HUMA-SHU 101")).toMatchObject({ placementId: "cas" });
    expect(derived.placementByCatalogId.get("stern:HUMA-SHU 101")).toMatchObject({ placementId: "stern" });
    expect(derived.creditsBySemester.get("Y1F")).toBe(3);
    expect(derived.creditsBySemester.get("Y1S")).toBe(2);
  });

  it("preserves partial interpretation coverage in the derived program map", () => {
    const sourceUrl =
      "https://bulletins.nyu.edu/undergraduate/shanghai/programs/humanities-ba/";
    const richProgram = CatalogProgramSchema.parse({
      id: "humanities",
      name: "Humanities (BA)",
      shortName: "Humanities",
      type: "major",
      categories: [
        {
          id: "foundation",
          name: "Foundation",
          requirement: { kind: "course", courseId: "HUMA-SHU 101" },
          sourceUrl,
          sourceTableId: "foundation",
          sourceRowIndexes: [0],
        },
      ],
      interpretations: [
        {
          id: "foundation",
          name: "Foundation",
          status: "verified",
          requirement: { kind: "course", courseId: "HUMA-SHU 101" },
          sourceTableIds: ["foundation"],
          sourceRowRefs: [{ tableId: "foundation", sourceIndex: 0 }],
          diagnostics: [],
        },
        {
          id: "electives",
          name: "Electives",
          status: "unavailable",
          requirement: null,
          sourceTableIds: ["electives"],
          sourceRowRefs: [{ tableId: "electives", sourceIndex: 0 }],
          diagnostics: [{ code: "unsupported", message: "Display only." }],
        },
      ],
      requirementRows: [],
      sourceRows: [],
      sourceReferenceIds: ["HUMA-SHU 101"],
      provenance: { sourceUrl, snapshotId: "snapshot", sourceHash: "hash" },
      auditAuthority: "nyush-bulletin",
    });

    const derived = derivePlan({ ...FIXTURE_INPUT, programs: [richProgram] });

    expect(derived.progressByProgram.get("humanities")).toMatchObject({
      interpretationStatus: "partial",
      authoritativePlannedFraction: null,
      automationCoverage: 0.5,
    });
  });
});
