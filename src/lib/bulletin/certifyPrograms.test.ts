import { describe, expect, it } from "vitest";
import {
  certifyShanghaiPrograms,
  type ProgramGoldenExpectation,
} from "@/lib/bulletin/certifyPrograms";
import { CatalogProgramSchema, type CatalogProgram } from "@/lib/types";

function program(id: string): CatalogProgram {
  return CatalogProgramSchema.parse({
    id,
    name: id === "data-science-bs" ? "Data Science (BS)" : "Mathematics (BS)",
    shortName: id,
    type: "major",
    categories: [
      {
        id: "probability",
        name: "Probability",
        requirement: {
          kind: "choose",
          count: 1,
          children: [
            { kind: "course", courseId: "MATH-SHU 235" },
            { kind: "course", courseId: "MATH-SHU 238" },
          ],
        },
        sourceUrl: `https://bulletins.nyu.edu/undergraduate/shanghai/programs/${id}/`,
        sourceTableId: "probability",
        sourceRowIndexes: [0, 1, 2],
      },
    ],
    bulletinDisplay: {
      schemaVersion: 2,
      sourceUrl: `https://bulletins.nyu.edu/undergraduate/shanghai/programs/${id}/`,
      sections: [
        {
          id: "curriculumtext",
          heading: "Curriculum",
          blocks: [
            {
              kind: "table",
              id: "probability",
              caption: null,
              headingTrail: [{ level: 3, text: "Probability" }],
              rows: [],
            },
          ],
        },
      ],
    },
    interpretations: [
      {
        id: "probability",
        name: "Probability",
        status: "verified",
        requirement: {
          kind: "choose",
          count: 1,
          children: [
            { kind: "course", courseId: "MATH-SHU 235" },
            { kind: "course", courseId: "MATH-SHU 238" },
          ],
        },
        sourceTableIds: ["probability"],
        sourceRowRefs: [
          { tableId: "probability", sourceIndex: 0 },
          { tableId: "probability", sourceIndex: 1 },
          { tableId: "probability", sourceIndex: 2 },
        ],
        diagnostics: [],
      },
    ],
    requirementRows: [],
    sourceRows: [],
    sourceReferenceIds: ["MATH-SHU 235", "MATH-SHU 238"],
    provenance: {
      sourceUrl: `https://bulletins.nyu.edu/undergraduate/shanghai/programs/${id}/`,
      snapshotId: "snapshot",
      sourceHash: "hash",
    },
    auditAuthority: "nyush-bulletin",
  });
}

function golden(programId: string): ProgramGoldenExpectation {
  return {
    programId,
    tableHeadings: ["Probability"],
    categoryNames: ["Probability"],
    selectors: [{ label: "Probability", count: 1, childCount: 2 }],
    manualConditions: [],
    unavailableGroups: [],
    samplePlanTermCount: 0,
  };
}

describe("certifyShanghaiPrograms", () => {
  it("produces deterministic sorted certification output", () => {
    const programs = [program("mathematics-bs"), program("data-science-bs")];
    const expectations = [golden("mathematics-bs"), golden("data-science-bs")];

    const first = certifyShanghaiPrograms(programs, expectations);
    const second = certifyShanghaiPrograms(
      [...programs].reverse(),
      [...expectations].reverse(),
    );

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: "pass",
      programCount: 2,
      passed: 2,
      failed: 0,
    });
    expect(first.programs.map((entry) => entry.programId)).toEqual([
      "data-science-bs",
      "mathematics-bs",
    ]);
  });

  it("fails when executable semantics differ from the reviewed golden", () => {
    const expectation = golden("data-science-bs");
    expectation.selectors = [
      { label: "Probability", count: 2, childCount: 2 },
    ];

    const report = certifyShanghaiPrograms(
      [program("data-science-bs")],
      [expectation],
    );

    expect(report.status).toBe("fail");
    expect(report.programs[0]).toMatchObject({
      status: "fail",
      errors: ["selector-mismatch"],
    });
  });

  it("accepts a reviewed unavailable group without inventing semantics", () => {
    const candidate = program("data-science-bs");
    candidate.interpretations = [
      {
        id: "electives",
        name: "Electives",
        status: "unavailable",
        requirement: null,
        sourceTableIds: ["probability"],
        sourceRowRefs: [{ tableId: "probability", sourceIndex: 0 }],
        diagnostics: [
          {
            code: "unsupported-requirement-row",
            message: "Credit total has no executable course set.",
            tableId: "probability",
            sourceIndex: 0,
          },
        ],
      },
    ];
    const expectation = golden("data-science-bs");
    expectation.selectors = [];
    expectation.unavailableGroups = ["Electives"];

    const report = certifyShanghaiPrograms([candidate], [expectation]);

    expect(report).toMatchObject({ status: "pass", passed: 1, failed: 0 });
  });
});
