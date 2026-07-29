import { describe, expect, it } from "vitest";
import { computeProgress } from "@/lib/progress";
import { CatalogProgramSchema, type Course } from "@/lib/types";

const sourceUrl =
  "https://bulletins.nyu.edu/undergraduate/shanghai/programs/test-program/";

function program(partial: boolean) {
  return CatalogProgramSchema.parse({
    id: "test-program",
    name: "Test Program",
    shortName: "Test",
    type: "major",
    categories: [
      {
        id: "foundation",
        name: "Foundation",
        requirement: {
          kind: "all",
          children: [
            { kind: "course", courseId: "TEST-SHU 101" },
            { kind: "course", courseId: "TEST-SHU 102" },
          ],
        },
        sourceUrl,
        sourceTableId: "foundation",
        sourceRowIndexes: [0, 1],
      },
    ],
    interpretations: [
      {
        id: "foundation",
        name: "Foundation",
        status: "verified",
        requirement: {
          kind: "all",
          children: [
            { kind: "course", courseId: "TEST-SHU 101" },
            { kind: "course", courseId: "TEST-SHU 102" },
          ],
        },
        sourceTableIds: ["foundation"],
        sourceRowRefs: [
          { tableId: "foundation", sourceIndex: 0 },
          { tableId: "foundation", sourceIndex: 1 },
        ],
        diagnostics: [],
      },
      ...(partial
        ? [
            {
              id: "electives",
              name: "Electives",
              status: "unavailable" as const,
              requirement: null,
              sourceTableIds: ["electives"],
              sourceRowRefs: [
                { tableId: "electives", sourceIndex: 0 },
              ],
              diagnostics: [
                {
                  code: "unsupported",
                  message: "Fixture is intentionally unavailable.",
                },
              ],
            },
          ]
        : []),
    ],
    requirementRows: [],
    sourceRows: [],
    sourceReferenceIds: ["TEST-SHU 101", "TEST-SHU 102"],
    provenance: { sourceUrl, snapshotId: "snapshot", sourceHash: "hash" },
    auditAuthority: "nyush-bulletin",
  });
}

const courses = new Map<string, Course>(
  ["TEST-SHU 101", "TEST-SHU 102"].map((id) => [
    id,
    {
      id,
      title: id,
      credits: 4,
      department: "TEST-SHU",
      prereqs: [],
      offered: ["fall", "spring"],
      sites: ["shanghai"],
      fulfills: [{ programId: "test-program", categoryId: "foundation" }],
      equivalentTo: [],
      attributes: [],
      tags: [],
    },
  ]),
);

function progressFor(partial: boolean) {
  return computeProgress({
    placements: [
      { courseId: "TEST-SHU 101", semesterId: "Y1F", allocation: "auto" },
    ],
    completedSemesters: [],
    coursesById: courses,
    programs: [program(partial)],
    effective: new Map([
      [
        "TEST-SHU 101",
        [{ programId: "test-program", categoryId: "foundation" }],
      ],
    ]),
  }).programs[0];
}

describe("verified program progress", () => {
  it("labels partial automation and suppresses authoritative fractions", () => {
    expect(progressFor(true)).toMatchObject({
      interpretationStatus: "partial",
      plannedFraction: 0.5,
      authoritativePlannedFraction: null,
      authoritativeCompletedFraction: null,
      verifiedCategoryCount: 1,
      totalInterpretationCount: 2,
      automationCoverage: 0.5,
    });
  });

  it("publishes authoritative fractions only for complete verification", () => {
    expect(progressFor(false)).toMatchObject({
      interpretationStatus: "verified",
      plannedFraction: 0.5,
      authoritativePlannedFraction: 0.5,
      authoritativeCompletedFraction: 0,
      verifiedCategoryCount: 1,
      totalInterpretationCount: 1,
      automationCoverage: 1,
    });
  });
});
