import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BulletinProgramParseError,
  parseProgramPage,
  type BulletinProgramPageSource,
} from "@/lib/bulletin/parseProgramPage";

const fixture = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)),
    "utf8",
  );

const PROGRAM_PAGE = fixture("program-page.html");
const CORE_PAGE = fixture("core-page.html");

const PROGRAM_META: BulletinProgramPageSource = {
  kind: "major",
  slug: "computer-science-bs",
  title: "Computer Science (BS)",
  url: "https://bulletins.nyu.edu/undergraduate/shanghai/programs/computer-science-bs/",
};

const CORE_META: BulletinProgramPageSource = {
  kind: "core",
  slug: "core-curriculum",
  title: "Core Curriculum",
  url: "https://bulletins.nyu.edu/undergraduate/shanghai/core-curriculum/",
};

describe("parseProgramPage", () => {
  it("preserves ordered requirement row roles, source text, credits, anchors, and footnotes", () => {
    const document = parseProgramPage(PROGRAM_PAGE, PROGRAM_META);

    expect(document).toMatchObject({
      kind: "program",
      slug: "computer-science-bs",
      title: "Computer Science (BS)",
      sourceUrl:
        "https://bulletins.nyu.edu/undergraduate/shanghai/programs/computer-science-bs/",
    });
    expect(document.requirementTables).toHaveLength(1);
    expect(
      document.requirementTables[0].rows.map((row) => row.role),
    ).toEqual([
      "areaHeader",
      "areaSubheader",
      "course",
      "comment",
      "total",
    ]);
    expect(document.requirementTables[0]).toMatchObject({
      id: "computer-science-requirements",
      sectionId: "requirements",
      caption: "Computer Science Major Requirements",
    });
    expect(document.requirementTables[0].rows[2]).toMatchObject({
      role: "course",
      sourceIndex: 2,
      text: "CSCI-SHU 101 Introduction to Computer Science 1 2-4",
      creditsText: "2-4",
      linkedCourseCodes: ["CSCI-SHU 101"],
      sourceAnchors: ["/search/?P=CSCI-SHU%20101", "#fn-1"],
      footnoteMarkers: ["1"],
    });
    expect(document.requirementTables[0].rows[3]).toMatchObject({
      role: "comment",
      creditsText: undefined,
      footnoteMarkers: ["†"],
      sourceAnchors: ["#fn-2"],
    });
    expect(document.requirementTables[0].rows[4].creditsText).toBe("64-68");
    expect(document.footnotes).toEqual([
      {
        id: "fn-1",
        marker: "1",
        text: "Required for students without equivalent prior study.",
      },
      {
        id: "fn-2",
        marker: "†",
        text: "The program director records approved substitutions.",
      },
    ]);
  });

  it("keeps the eight-term sample plan separate from requirement tables", () => {
    const document = parseProgramPage(PROGRAM_PAGE, PROGRAM_META);

    expect(document.samplePlan?.terms).toHaveLength(8);
    expect(document.samplePlan?.terms[0]).toMatchObject({
      id: "plan-year-1-fall",
      heading: "Year 1 Fall",
      rows: [
        expect.objectContaining({
          text: "CSCI-SHU 101 Introduction to Computer Science 4",
          creditsText: "4",
        }),
      ],
    });
    expect(document.requirementTables.map((table) => table.id)).not.toContain(
      "plan-year-1-fall",
    );
    expect(document.sections.find((section) => section.id === "sample-plan"))
      .toMatchObject({ heading: "Sample Plan of Study" });
  });

  it("retains policies as ordered source sections without interpreting them", () => {
    const document = parseProgramPage(PROGRAM_PAGE, PROGRAM_META);

    expect(document.policies).toEqual([
      {
        id: "academic-policies",
        heading: "Academic Policies",
        text:
          "Students must consult their academic advisor before changing the sequence. At most one approved course may be shared with another major.",
      },
    ]);
    expect(document.sections.map((section) => section.id)).toEqual([
      "overview",
      "requirements",
      "academic-policies",
      "sample-plan",
    ]);
  });

  it("parses the canonical Shanghai Core document and preserves exam waivers", () => {
    const document = parseProgramPage(CORE_PAGE, CORE_META);

    expect(document).toMatchObject({
      kind: "core",
      slug: "core-curriculum",
      title: "Core Curriculum",
    });
    expect(document.requirementTables[0].rows.map((row) => row.role)).toEqual([
      "areaHeader",
      "areaSubheader",
      "course",
      "comment",
      "total",
    ]);
    expect(document.requirementTables[0].rows[3].creditsText).toBe("4-8");
    expect(document.policies).toEqual([
      expect.objectContaining({
        id: "exam-waivers",
        heading: "Exam Waivers",
        text: expect.stringContaining("waive a proficiency requirement"),
      }),
    ]);
    expect(document.footnotes).toContainEqual({
      id: "core-note",
      marker: "*",
      text: "* Approved equivalents retain the Core designation.",
    });
  });

  it("rejects metadata outside canonical Shanghai program and Core paths", () => {
    expect(() =>
      parseProgramPage(PROGRAM_PAGE, {
        ...PROGRAM_META,
        url: "https://bulletins.nyu.edu/undergraduate/new-york/programs/computer-science-bs/",
      }),
    ).toThrowError(BulletinProgramParseError);
    expect(() =>
      parseProgramPage(CORE_PAGE, {
        ...CORE_META,
        url: "https://bulletins.nyu.edu/undergraduate/shanghai/programs/core-curriculum/",
      }),
    ).toThrow("identity could not be verified");
  });

  it("rejects a page whose heading or breadcrumb does not verify Shanghai identity", () => {
    const wrongHeading = PROGRAM_PAGE.replace(
      "<h1>Computer Science (BS)</h1>",
      "<h1>Computer Engineering (BS)</h1>",
    );
    const wrongCampus = PROGRAM_PAGE.replace(
      '<a href="/undergraduate/shanghai/">NYU Shanghai</a>',
      '<a href="/undergraduate/new-york/">New York</a>',
    );

    expect(() => parseProgramPage(wrongHeading, PROGRAM_META)).toThrow(
      "identity could not be verified",
    );
    expect(() => parseProgramPage(wrongCampus, PROGRAM_META)).toThrow(
      "identity could not be verified",
    );
  });

  it("rejects BA or BS documents with no requirement tables", () => {
    const missingRequirements = PROGRAM_PAGE.replace(
      /<table class="sc_courselist" id="computer-science-requirements">[\s\S]*?<\/table>/,
      "",
    );

    expect(() => parseProgramPage(missingRequirements, PROGRAM_META)).toThrow(
      "did not contain degree requirements",
    );
  });

  it("rejects duplicate source table IDs", () => {
    const duplicateId = PROGRAM_PAGE.replace(
      'id="plan-year-1-fall"',
      'id="computer-science-requirements"',
    );

    expect(() => parseProgramPage(duplicateId, PROGRAM_META)).toThrow(
      "Duplicate Bulletin table ID: computer-science-requirements",
    );
  });

  it("rejects a requirement table row that cannot be preserved in order", () => {
    const unsupportedRow = PROGRAM_PAGE.replace(
      '<tr class="listsum">',
      '<tr class="mystery-row">',
    );

    expect(() => parseProgramPage(unsupportedRow, PROGRAM_META)).toThrow(
      "could not preserve requirement row order",
    );
  });
});
