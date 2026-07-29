import { describe, expect, it } from "vitest";
import { compileProgramRequirements } from "@/lib/bulletin/compileRequirements";
import type {
  BulletinProgramDocument,
  SourceTable,
  SourceTableRow,
} from "@/lib/bulletin/parseProgramPage";

const SOURCE_URL =
  "https://bulletins.nyu.edu/undergraduate/shanghai/programs/data-science-bs/";

function row(
  role: SourceTableRow["role"],
  sourceIndex: number,
  text: string,
  creditsText?: string,
  linkedCourseCodes: string[] = [],
): SourceTableRow {
  return {
    role,
    sourceIndex,
    text,
    ...(creditsText ? { creditsText } : {}),
    linkedCourseCodes,
    sourceAnchors: linkedCourseCodes.map(
      (code) => `/search/?P=${encodeURIComponent(code)}`,
    ),
    footnoteMarkers: [],
  };
}

function table(
  id: string,
  rows: SourceTableRow[],
  heading?: string,
): SourceTable {
  return {
    id,
    sectionId: "curriculumtext",
    headingTrail: heading ? [{ level: 3, text: heading }] : [],
    rows,
  };
}

function document(requirementTables: SourceTable[]): BulletinProgramDocument {
  return {
    kind: "program",
    slug: "data-science-bs",
    title: "Data Science (BS)",
    sourceUrl: SOURCE_URL,
    bulletinDisplay: {
      schemaVersion: 2,
      sourceUrl: SOURCE_URL,
      sections: [],
    },
    sections: [],
    requirementTables,
    policies: [],
    footnotes: [],
  };
}

const titles = new Map([
  ["MATH-SHU 235", "Probability and Statistics"],
  ["MATH-SHU 238", "Honors Theory of Probability"],
  ["BUSF-SHU 101", "Foundations of Finance"],
  ["BUSM-SHU 101", "Foundations of Marketing"],
]);

describe("compileProgramRequirements", () => {
  it("compiles Select one and keeps its credit cell out of the cardinality", () => {
    const result = compileProgramRequirements(
      document([
        table("probability", [
          row("areaHeader", 0, "Probability"),
          row("areaSubheader", 1, "Select one of the following:", "4"),
          row(
            "course",
            2,
            "MATH-SHU 235 Probability and Statistics",
            undefined,
            ["MATH-SHU 235"],
          ),
          row(
            "course",
            3,
            "MATH-SHU 238 Honors Theory of Probability",
            undefined,
            ["MATH-SHU 238"],
          ),
        ]),
      ]),
      titles,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "Probability",
      status: "verified",
      requirement: {
        kind: "choose",
        count: 1,
        children: [{ kind: "course" }, { kind: "course" }],
      },
    });
  });

  it("does not compile a structural heading as manual confirmation", () => {
    const [result] = compileProgramRequirements(
      document([
        table("foundation", [
          row("areaHeader", 0, "Foundational Courses"),
        ]),
      ]),
      titles,
    );

    expect(result).toMatchObject({
      name: "Foundational Courses",
      status: "unavailable",
      requirement: null,
      diagnostics: [expect.objectContaining({ code: "no-executable-rows" })],
    });
  });

  it("binds Complete one concentration to named tables", () => {
    const result = compileProgramRequirements(
      document([
        table("selector", [
          row(
            "areaSubheader",
            0,
            "Complete one of the following concentrations:",
          ),
        ], "Concentrations"),
        table(
          "finance",
          [
            row(
              "course",
              0,
              "BUSF-SHU 101 Foundations of Finance",
              "4",
              ["BUSF-SHU 101"],
            ),
          ],
          "Finance",
        ),
        table(
          "marketing",
          [
            row(
              "course",
              0,
              "BUSM-SHU 101 Foundations of Marketing",
              "4",
              ["BUSM-SHU 101"],
            ),
          ],
          "Marketing",
        ),
      ]),
      titles,
    );

    expect(result.find((item) => item.name === "Concentrations")).toMatchObject({
      status: "verified",
      sourceTableIds: ["selector", "finance", "marketing"],
      requirement: {
        kind: "choose",
        count: 1,
        children: [
          { kind: "all", children: [{ kind: "course", courseId: "BUSF-SHU 101" }] },
          { kind: "all", children: [{ kind: "course", courseId: "BUSM-SHU 101" }] },
        ],
      },
    });
    expect(result.map((item) => item.name)).not.toContain("Finance");
  });

  it("keeps unknown notes unavailable instead of inventing manual obligations", () => {
    const [result] = compileProgramRequirements(
      document([
        table("notes", [
          row("areaHeader", 0, "Electives"),
          row("comment", 1, "Additional electives may be available."),
        ]),
      ]),
      titles,
    );

    expect(result).toMatchObject({ status: "unavailable", requirement: null });
    expect(JSON.stringify(result)).not.toContain("manualConfirmation");
  });

  it("uses manual confirmation only for positively classified conditions", () => {
    const [result] = compileProgramRequirements(
      document([
        table("advising", [
          row("areaHeader", 0, "Advising"),
          row(
            "comment",
            1,
            "With advisor approval, another course may be substituted.",
          ),
        ]),
      ]),
      titles,
    );

    expect(result).toMatchObject({
      status: "verified",
      requirement: {
        kind: "manualConfirmation",
        label: "Advising",
      },
    });
  });
});
