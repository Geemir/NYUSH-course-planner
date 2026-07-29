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
const SAMPLE_PLAN_PAGE = fixture("computer-science-sample-plan.html");
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

  it("preserves official hyphenated course-code suffixes in requirement rows", () => {
    const suffixedCode = PROGRAM_PAGE.replace(
      ">CSCI-SHU 101</a>",
      ">CSCI-SHU 140T-A</a>",
    );

    expect(
      parseProgramPage(suffixedCode, PROGRAM_META).requirementTables[0].rows[2]
        .linkedCourseCodes,
    ).toEqual(["CSCI-SHU 140T-A"]);
  });

  it("keeps the eight-term sample plan separate from requirement tables", () => {
    const document = parseProgramPage(PROGRAM_PAGE, PROGRAM_META);

    expect(document.samplePlan?.terms).toHaveLength(8);
    expect(document.samplePlan?.terms[0]).toMatchObject({
      sourceIndex: 0,
      heading: "Year 1 Fall",
      ordinal: 1,
      rows: [
        expect.objectContaining({
          kind: "course",
          text: "CSCI-SHU 101 Introduction to Computer Science 4",
          creditsText: "4",
          linkedCourseCodes: ["CSCI-SHU 101"],
        }),
      ],
    });
    expect(document.requirementTables.map((table) => table.id)).not.toContain(
      "plan-year-1-fall",
    );
    expect(document.sections.find((section) => section.id === "sample-plan"))
      .toMatchObject({ heading: "Sample Plan of Study" });
  });

  it("preserves source tables with their nearest heading trails", () => {
    const document = parseProgramPage(SAMPLE_PLAN_PAGE, PROGRAM_META);
    const finance = document.bulletinDisplay.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.kind === "table" && block.id === "finance-table");

    expect(finance).toMatchObject({
      kind: "table",
      caption: "Course List",
      headingTrail: expect.arrayContaining([
        { level: 3, text: "Finance" },
      ]),
      rows: [
        expect.objectContaining({
          role: "course",
          linkedCourseCodes: ["BUSF-SHU 101"],
        }),
      ],
    });
  });

  it("uses generated source IDs when Bulletin requirement tables omit DOM IDs", () => {
    const withoutTableId = PROGRAM_PAGE.replace(
      ' id="computer-science-requirements"',
      "",
    );
    const document = parseProgramPage(withoutTableId, PROGRAM_META);
    const tables = document.bulletinDisplay.sections.flatMap((section) =>
      section.blocks.filter((block) => block.kind === "table"),
    );

    expect(document.requirementTables[0].id).toBe("requirements-table-1");
    expect(tables).toEqual([
      expect.objectContaining({
        kind: "table",
        id: "requirements-table-1",
      }),
    ]);
  });

  it("splits one official plan grid into eight terms and preserves placeholders", () => {
    const samplePlan = parseProgramPage(SAMPLE_PLAN_PAGE, PROGRAM_META).samplePlan;

    expect(samplePlan).toMatchObject({
      sectionId: "sampleplanofstudytextcontainer",
      heading: "Sample Plan of Study",
      totalCreditsText: "40",
      importStatus: "eligible",
      diagnostics: [],
    });
    expect(samplePlan?.terms).toHaveLength(8);
    expect(samplePlan?.terms[0]).toMatchObject({
      sourceIndex: 0,
      heading: "1st Semester/Term",
      ordinal: 1,
      creditsText: "8",
      rows: [
        expect.objectContaining({
          kind: "course",
          linkedCourseCodes: ["MATH-SHU 131"],
        }),
        expect.objectContaining({
          kind: "placeholder",
          label: "Chinese or EAP",
          creditsText: "4",
        }),
      ],
    });
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
    expect(document.footnotes).toContainEqual({
      id: "core-note",
      marker: "*",
      text: "* Approved equivalents retain the Core designation.",
    });
  });

  it("preserves ordered CourseLeaf text containers with direct and list prose as policies", () => {
    const document = parseProgramPage(CORE_PAGE, CORE_META);

    expect(document.sections.map((section) => section.id)).toEqual([
      "core-requirements",
      "examwaiverstextcontainer",
    ]);
    expect(document.sections[1]).toEqual({
      id: "examwaiverstextcontainer",
      heading: "Policies and Exam Waivers",
      text:
        "Students must consult an advisor before using an exam waiver. Qualifying examination scores may waive a proficiency requirement. Waivers do not award credit.",
      prose: [
        "Students must consult an advisor before using an exam waiver.",
        "Qualifying examination scores may waive a proficiency requirement.",
        "Waivers do not award credit.",
      ],
      tableIds: [],
    });
    expect(document.policies).toEqual([
      {
        id: "examwaiverstextcontainer",
        heading: "Policies and Exam Waivers",
        text:
          "Students must consult an advisor before using an exam waiver. Qualifying examination scores may waive a proficiency requirement. Waivers do not award credit.",
      },
    ]);
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

  it("accepts the official plural Breadcrumbs aria label", () => {
    const liveBreadcrumb = PROGRAM_PAGE.replace(
      'aria-label="Breadcrumb"',
      'aria-label="Breadcrumbs"',
    );

    expect(parseProgramPage(liveBreadcrumb, PROGRAM_META).slug).toBe(
      "computer-science-bs",
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

  it("rejects BA or BS documents whose retained requirement table has no rows", () => {
    const emptyRequirements = PROGRAM_PAGE.replace(
      /(<table class="sc_courselist" id="computer-science-requirements">[\s\S]*?<tbody>)[\s\S]*?(<\/tbody>)/,
      "$1$2",
    );

    expect(() => parseProgramPage(emptyRequirements, PROGRAM_META)).toThrow(
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

  it("derives a deterministic table ID from the official source container", () => {
    const liveTable = PROGRAM_PAGE.replace(
      ' id="computer-science-requirements"',
      "",
    );

    const document = parseProgramPage(liveTable, PROGRAM_META);

    expect(document.requirementTables[0].id).toBe("requirements-table-1");
    expect(document.requirementTables[0].sectionId).toBe("requirements");
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
