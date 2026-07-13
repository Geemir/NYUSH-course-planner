import { describe, expect, it } from "vitest";
import { normalizeBulletin } from "@/lib/bulletin/normalize";
import type { BulletinSourceDocument } from "@/lib/bulletin/parseCoursePage";
import type {
  BulletinProgramDocument,
  SourceTableRow,
} from "@/lib/bulletin/parseProgramPage";
import type { BulletinDiscovery } from "@/lib/bulletin/sourceTypes";
import { CatalogCandidateSchema } from "@/lib/types";

const PROGRAM_URL =
  "https://bulletins.nyu.edu/undergraduate/shanghai/programs/mathematics-bs/";
const SUBJECT_URL =
  "https://bulletins.nyu.edu/undergraduate/shanghai/courses/math-shu/";

const discovery: BulletinDiscovery = {
  majors: [
    {
      kind: "major",
      slug: "mathematics-bs",
      title: "Mathematics (BS)",
      url: PROGRAM_URL,
    },
  ],
  minors: [],
  subjects: [
    {
      kind: "subject",
      slug: "math-shu",
      title: "Mathematics (MATH-SHU)",
      url: SUBJECT_URL,
    },
  ],
};

function row(
  role: SourceTableRow["role"],
  sourceIndex: number,
  text: string,
  linkedCourseCodes: string[] = [],
  creditsText?: string,
): SourceTableRow {
  return {
    role,
    sourceIndex,
    text,
    linkedCourseCodes,
    sourceAnchors: linkedCourseCodes.map(
      (code) => `/search/?P=${encodeURIComponent(code)}`,
    ),
    footnoteMarkers: [],
    ...(creditsText ? { creditsText } : {}),
  };
}

const programDocument: BulletinProgramDocument = {
  kind: "program",
  slug: "mathematics-bs",
  title: "Mathematics (BS)",
  sourceUrl: PROGRAM_URL,
  sections: [],
  policies: [],
  footnotes: [],
  requirementTables: [
    {
      id: "major-requirements",
      sectionId: "requirements",
      caption: "Major Requirements",
      rows: [
        row("areaHeader", 0, "Choice"),
        row("areaSubheader", 1, "Select one"),
        row("course", 2, "MATH-SHU 235 Probability", ["MATH-SHU 235"], "4"),
        row("course", 3, "MATH-SHU 238 Statistics", ["MATH-SHU 238"], "4"),

        row("areaHeader", 4, "Credit Pool"),
        row("areaSubheader", 5, "Complete 8 credits from:"),
        row("course", 6, "MATH-SHU 121 Calculus", ["MATH-SHU 121"], "4"),
        row("course", 7, "CSCI-SHU 205 Topics", ["CSCI-SHU 205"], "2-4"),

        row("areaHeader", 8, "Attribute Pool"),
        row(
          "comment",
          9,
          'Courses with the "Data Science Elective" attribute.',
        ),

        row("areaHeader", 10, "Attribute Exclusion"),
        row(
          "comment",
          11,
          'Courses with the "Data Science Elective" attribute, excluding CSCI-SHU 101.',
          ["CSCI-SHU 101"],
        ),

        row("areaHeader", 12, "Placement"),
        row("comment", 13, "Placement examination may waive this requirement."),

        row("areaHeader", 14, "External Study"),
        row(
          "course",
          15,
          "CSCI-UA 101 Introduction to Computer Science",
          ["CSCI-UA 101"],
          "4",
        ),

        row("areaHeader", 16, "Advising"),
        row(
          "comment",
          17,
          "With advisor approval, another course may be substituted.",
        ),
        row("total", 18, "Total Credits 32", [], "32"),
      ],
    },
  ],
};

const subjectDocument: BulletinSourceDocument = {
  kind: "subject",
  slug: "math-shu",
  title: "Mathematics (MATH-SHU)",
  sourceUrl: SUBJECT_URL,
  courses: [
    {
      code: "MATH-SHU 235",
      title: "Probability",
      creditsText: "0 Credits",
      offeringText: "Fall",
      linkedCourseIds: [],
      attributes: [],
      detailTexts: [],
    },
    {
      code: "MATH-SHU 238",
      title: "Statistics",
      creditsText: "2-4 Credits",
      offeringText: "Occasionally",
      linkedCourseIds: [],
      attributes: [],
      detailTexts: [],
    },
    {
      code: "MATH-SHU 121",
      title: "Calculus",
      creditsText: "4 Credits",
      offeringText: "Fall and Spring",
      linkedCourseIds: [],
      attributes: [],
      detailTexts: [],
    },
    {
      code: "CSCI-SHU 101",
      title: "Introduction to Computer Science",
      creditsText: "4 Credits",
      offeringText: "Every year",
      prerequisiteText: "MATH-SHU 121 or placement examination",
      linkedCourseIds: ["MATH-SHU 121"],
      attributes: ["Data Science Elective"],
      detailTexts: [],
    },
    {
      code: "CSCI-SHU 205",
      title: "Topics",
      creditsText: "4 Credits",
      prerequisiteText:
        "CSCI-SHU 101 or MATH-SHU 121, and MATH-SHU 238",
      linkedCourseIds: ["CSCI-SHU 101", "MATH-SHU 121", "MATH-SHU 238"],
      attributes: ["Data Science Elective"],
      detailTexts: [],
    },
  ],
};

const normalize = () =>
  normalizeBulletin(discovery, [subjectDocument, programDocument]);

describe("normalizeBulletin", () => {
  it("normalizes exact courses and explicit select-one and credit pools", () => {
    const categories = normalize().programs[0].categories;

    expect(categories[0].requirement).toEqual({
      kind: "choose",
      count: 1,
      children: [
        { kind: "course", courseId: "MATH-SHU 235" },
        { kind: "course", courseId: "MATH-SHU 238" },
      ],
    });
    expect(categories[1].requirement).toEqual({
      kind: "credits",
      minimum: 8,
      children: [
        { kind: "course", courseId: "MATH-SHU 121" },
        { kind: "course", courseId: "CSCI-SHU 205" },
      ],
    });
    expect(categories[5].requirement).toEqual({
      kind: "course",
      courseId: "CSCI-UA 101",
    });
  });

  it("normalizes explicit attribute, exclusion, and waiver rows", () => {
    const categories = normalize().programs[0].categories;

    expect(categories[2].requirement).toEqual({
      kind: "attribute",
      attribute: "Data Science Elective",
    });
    expect(categories[3].requirement).toEqual({
      kind: "exclusion",
      excludedCourseIds: ["CSCI-SHU 101"],
      child: { kind: "attribute", attribute: "Data Science Elective" },
    });
    expect(categories[4].requirement).toEqual({
      kind: "waiver",
      waiverId: "mathematics-bs-placement-13",
      label: "Placement examination",
    });
  });

  it("preserves unsupported advisor judgment as manual confirmation", () => {
    const category = normalize().programs[0].categories.at(-1);

    expect(category?.requirement).toEqual({
      kind: "manualConfirmation",
      label: "Advising",
      sourceText: "With advisor approval, another course may be substituted.",
    });
  });

  it("does not treat a course row with an alternative as an exact course", () => {
    const ambiguousProgram: BulletinProgramDocument = {
      ...programDocument,
      requirementTables: [
        {
          id: "ambiguous-course",
          sectionId: "requirements",
          rows: [
            row("areaHeader", 0, "Preparation"),
            row(
              "course",
              1,
              "MATH-SHU 121 Calculus or placement examination",
              ["MATH-SHU 121"],
              "4",
            ),
          ],
        },
      ],
    };

    const requirement = normalizeBulletin(discovery, [
      subjectDocument,
      ambiguousProgram,
    ]).programs[0].categories[0].requirement;

    expect(requirement).toEqual({
      kind: "manualConfirmation",
      label: "Preparation",
      sourceText: "MATH-SHU 121 Calculus or placement examination",
    });
  });

  it("does not turn an unsupported selector into an all-courses rule", () => {
    const unsupportedSelector: BulletinProgramDocument = {
      ...programDocument,
      requirementTables: [
        {
          id: "unsupported-selector",
          sectionId: "requirements",
          rows: [
            row("areaHeader", 0, "Advanced Work"),
            row("areaSubheader", 1, "Select two"),
            row("course", 2, "MATH-SHU 235 Probability", ["MATH-SHU 235"], "4"),
            row("course", 3, "MATH-SHU 238 Statistics", ["MATH-SHU 238"], "4"),
          ],
        },
      ],
    };

    const category = normalizeBulletin(discovery, [
      subjectDocument,
      unsupportedSelector,
    ]).programs[0].categories[0];

    expect(category.requirement).toEqual({
      kind: "all",
      children: [
        {
          kind: "manualConfirmation",
          label: "Advanced Work",
          sourceText: "Select two",
        },
        {
          kind: "manualConfirmation",
          label: "Advanced Work",
          sourceText: "MATH-SHU 235 Probability",
        },
        {
          kind: "manualConfirmation",
          label: "Advanced Work",
          sourceText: "MATH-SHU 238 Statistics",
        },
      ],
    });
  });

  it("represents every semantic source row and preserves all structural rows", () => {
    const program = normalize().programs[0];

    expect(program.requirementRows.map((entry) => entry.sourceIndex)).toEqual([
      1, 2, 3, 5, 6, 7, 9, 11, 13, 15, 17,
    ]);
    expect(program.sourceRows.map((entry) => entry.sourceIndex)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
    expect(program.sourceRows.map((entry) => entry.representation)).toEqual([
      "categoryBoundary",
      "requirementNode",
      "requirementNode",
      "requirementNode",
      "categoryBoundary",
      "requirementNode",
      "requirementNode",
      "requirementNode",
      "categoryBoundary",
      "requirementNode",
      "categoryBoundary",
      "requirementNode",
      "categoryBoundary",
      "requirementNode",
      "categoryBoundary",
      "requirementNode",
      "categoryBoundary",
      "requirementNode",
      "publishedTotal",
    ]);
    expect(
      program.requirementRows.find((entry) => entry.sourceIndex === 17)?.node,
    ).toEqual({
      kind: "manualConfirmation",
      label: "Advising",
      sourceText: "With advisor approval, another course may be substituted.",
    });
  });

  it("supports zero, fixed, and variable credit courses", () => {
    const courses = new Map(normalize().courses.map((course) => [course.id, course]));

    expect(courses.get("MATH-SHU 235")).toMatchObject({
      credits: 0,
      minCredits: 0,
      maxCredits: 0,
      creditsText: "0 Credits",
    });
    expect(courses.get("MATH-SHU 121")).toMatchObject({
      credits: 4,
      minCredits: 4,
      maxCredits: 4,
    });
    expect(courses.get("MATH-SHU 238")).toMatchObject({
      credits: 4,
      minCredits: 2,
      maxCredits: 4,
      creditsText: "2-4 Credits",
    });
  });

  it("marks offerings known only when explicit terms are present", () => {
    const courses = new Map(normalize().courses.map((course) => [course.id, course]));

    expect(courses.get("MATH-SHU 121")).toMatchObject({
      offered: ["fall", "spring"],
      offeringKnown: true,
    });
    expect(courses.get("MATH-SHU 238")).toMatchObject({
      offered: [],
      offeringKnown: false,
    });
    expect(courses.get("CSCI-SHU 101")).toMatchObject({
      offered: [],
      offeringKnown: false,
    });
    expect(courses.get("CSCI-SHU 205")).toMatchObject({
      offered: [],
      offeringKnown: false,
    });
  });

  it("keeps raw prerequisites and normalizes only code-only explicit connectives", () => {
    const courses = new Map(normalize().courses.map((course) => [course.id, course]));

    expect(courses.get("CSCI-SHU 101")).toMatchObject({
      prerequisiteText: "MATH-SHU 121 or placement examination",
      prereqs: [],
    });
    expect(courses.get("CSCI-SHU 205")).toMatchObject({
      prerequisiteText:
        "CSCI-SHU 101 or MATH-SHU 121, and MATH-SHU 238",
      prereqs: [
        ["CSCI-SHU 101", "MATH-SHU 121"],
        ["MATH-SHU 238"],
      ],
    });
  });

  it("does not infer precedence for unpunctuated mixed prerequisites", () => {
    const ambiguousPrerequisite: BulletinSourceDocument = {
      ...subjectDocument,
      courses: subjectDocument.courses.map((course) =>
        course.code === "CSCI-SHU 205"
          ? {
              ...course,
              prerequisiteText:
                "CSCI-SHU 101 or MATH-SHU 121 and MATH-SHU 238",
            }
          : course,
      ),
    };

    const course = normalizeBulletin(discovery, [
      ambiguousPrerequisite,
      programDocument,
    ]).courses.find((candidate) => candidate.id === "CSCI-SHU 205");

    expect(course).toMatchObject({
      prerequisiteText:
        "CSCI-SHU 101 or MATH-SHU 121 and MATH-SHU 238",
      prereqs: [],
    });
  });

  it("classifies unresolved linked NYU courses without fabricating records", () => {
    const candidate = normalize();

    expect(candidate.externalCourseIds).toEqual(["CSCI-UA 101"]);
    expect(candidate.courses.some((course) => course.id === "CSCI-UA 101")).toBe(
      false,
    );
  });

  it("does not misclassify an unresolved Shanghai code as external", () => {
    const withUnresolvedShanghai: BulletinProgramDocument = {
      ...programDocument,
      requirementTables: [
        ...programDocument.requirementTables,
        {
          id: "unresolved-requirement",
          sectionId: "requirements",
          rows: [
            row("areaHeader", 0, "Unresolved Shanghai Reference"),
            row(
              "course",
              1,
              "MATH-SHU 999 Unresolved Course",
              ["MATH-SHU 999"],
              "4",
            ),
          ],
        },
      ],
    };

    const candidate = normalizeBulletin(discovery, [
      subjectDocument,
      withUnresolvedShanghai,
    ]);

    expect(candidate.externalCourseIds).toEqual(["CSCI-UA 101"]);
  });

  it("classifies explicit external prerequisite codes", () => {
    const withExternalPrerequisite: BulletinSourceDocument = {
      ...subjectDocument,
      courses: [
        ...subjectDocument.courses,
        {
          code: "MATH-SHU 300",
          title: "External Preparation",
          creditsText: "4 Credits",
          prerequisiteText: "MATH-UA 101",
          linkedCourseIds: ["MATH-UA 101"],
          attributes: [],
          detailTexts: [],
        },
      ],
    };

    const candidate = normalizeBulletin(discovery, [
      withExternalPrerequisite,
      programDocument,
    ]);

    expect(candidate.externalCourseIds).toEqual(["CSCI-UA 101", "MATH-UA 101"]);
  });

  it("builds deterministic fulfillments from direct and attribute nodes", () => {
    const courses = new Map(normalize().courses.map((course) => [course.id, course]));

    expect(courses.get("MATH-SHU 235")?.fulfills).toEqual([
      { programId: "mathematics-bs", categoryId: "choice" },
    ]);
    expect(courses.get("CSCI-SHU 101")?.fulfills).toEqual([
      { programId: "mathematics-bs", categoryId: "attribute-pool" },
    ]);
    expect(courses.get("CSCI-SHU 205")?.fulfills).toEqual([
      { programId: "mathematics-bs", categoryId: "attribute-exclusion" },
      { programId: "mathematics-bs", categoryId: "attribute-pool" },
      { programId: "mathematics-bs", categoryId: "credit-pool" },
    ]);
  });

  it("attaches deterministic provenance and passes the candidate schema", () => {
    const first = normalize();
    const second = normalize();

    expect(second).toEqual(first);
    expect(first.courses[0].provenance).toMatchObject({
      sourceUrl: SUBJECT_URL,
      snapshotId: first.snapshotId,
      sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(CatalogCandidateSchema.parse(first)).toEqual(first);
  });
});
