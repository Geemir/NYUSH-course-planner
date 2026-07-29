import { describe, expect, it } from "vitest";
import {
  normalizeBulletin,
  normalizeBulletinSource,
} from "@/lib/bulletin/normalize";
import type { BulletinSourceDocument } from "@/lib/bulletin/parseCoursePage";
import type {
  BulletinProgramDocument,
  SourceTableRow,
} from "@/lib/bulletin/parseProgramPage";
import type { BulletinDiscovery } from "@/lib/bulletin/sourceTypes";
import { getCatalogSource } from "@/lib/bulletin/sourceRegistry";
import { CatalogCandidateSchema } from "@/lib/types";

const PROGRAM_URL =
  "https://bulletins.nyu.edu/undergraduate/shanghai/programs/mathematics-bs/";
const SUBJECT_URL =
  "https://bulletins.nyu.edu/undergraduate/shanghai/courses/math-shu/";

const discovery: BulletinDiscovery = {
  sourceId: "nyu-shanghai",
  source: getCatalogSource("nyu-shanghai"),
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
  programUrls: [PROGRAM_URL],
  courseIndexUrls: [
    "https://bulletins.nyu.edu/undergraduate/shanghai/courses/",
  ],
  coursePageUrls: [SUBJECT_URL],
  discoveredUrls: [PROGRAM_URL, SUBJECT_URL],
};

function newYorkDiscovery(sourceId: string, slug: string): BulletinDiscovery {
  const source = getCatalogSource(sourceId);
  const pageUrl = `${source.courseIndexUrl}${slug}/`;
  return {
    sourceId,
    source,
    majors: [],
    minors: [],
    subjects: [{ kind: "subject", slug, title: slug.toUpperCase(), url: pageUrl }],
    programUrls: [],
    courseIndexUrls: [source.courseIndexUrl],
    coursePageUrls: [pageUrl],
    discoveredUrls: [source.courseIndexUrl, pageUrl],
  };
}

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
  bulletinDisplay: {
    schemaVersion: 2,
    sourceUrl: PROGRAM_URL,
    sections: [],
  },
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
        ),

        row("areaHeader", 12, "Placement"),
        row("comment", 13, "Placement examination may waive this requirement."),

        row("areaHeader", 14, "External Study"),
        row(
          "course",
          15,
          "CSCI-UA 101",
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
  it("marks Shanghai programs as NYUSH Bulletin audit records", () => {
    const program = normalize().programs[0];

    expect(program.auditAuthority).toBe("nyush-bulletin");
    expect(program.eligibleProfileRoles).toEqual([
      "primaryMajor",
      "secondMajor",
    ]);
  });

  it("keeps a code-only local requirement unavailable when inventory cannot verify it", () => {
    const unresolvedProgram: BulletinProgramDocument = {
      ...programDocument,
      requirementTables: [
        {
          id: "unresolved-requirements",
          sectionId: "requirements",
          rows: [
            row("areaHeader", 0, "Legacy Requirement"),
            row("course", 1, "MATH-SHU 998", ["MATH-SHU 998"], "4"),
          ],
        },
      ],
    };

    const candidate = normalizeBulletin(discovery, [
      subjectDocument,
      unresolvedProgram,
    ]);

    expect(candidate.programs[0].categories).toEqual([]);
    expect(candidate.programs[0].interpretations[0]).toMatchObject({
      name: "Legacy Requirement",
      status: "unavailable",
      requirement: null,
    });
    expect(candidate.unresolvedCourseIds).toContain("MATH-SHU 998");
  });

  it("normalizes official hyphenated course-code suffixes", () => {
    const suffixedProgram: BulletinProgramDocument = {
      ...programDocument,
      requirementTables: [
        {
          id: "suffix-requirements",
          sectionId: "requirements",
          rows: [
            row("areaHeader", 0, "Studio"),
            row(
              "course",
              1,
              "INTM-SHU 140T-A Open Project Salon",
              ["INTM-SHU 140T-A"],
              "4",
            ),
          ],
        },
      ],
    };
    const suffixedSubject: BulletinSourceDocument = {
      ...subjectDocument,
      courses: [
        {
          code: "INTM-SHU 140T-A",
          title: "Open Project Salon",
          creditsText: "4 Credits",
          linkedCourseIds: [],
          attributes: [],
          detailTexts: [],
        },
      ],
    };

    expect(
      normalizeBulletin(discovery, [suffixedSubject, suffixedProgram]).programs[0]
        .categories[0].requirement,
    ).toEqual({ kind: "course", courseId: "INTM-SHU 140T-A" });
  });

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

  it("only manualizes course rows containing a recognized attestable condition", () => {
    const policyRows = [
      ["MATH-SHU 121 Calculus and permission of instructor", "unavailable"],
      ["MATH-SHU 121 Calculus with advisor approval", "verified"],
      ["MATH-SHU 121 Calculus placement examination", "verified"],
    ] as const;

    for (const [sourceText, status] of policyRows) {
      const policyProgram: BulletinProgramDocument = {
        ...programDocument,
        requirementTables: [
          {
            id: "policy-course",
            sectionId: "requirements",
            rows: [
              row("areaHeader", 0, "Preparation"),
              row("course", 1, sourceText, ["MATH-SHU 121"], "4"),
            ],
          },
        ],
      };

      const program = normalizeBulletin(discovery, [
        subjectDocument,
        policyProgram,
      ]).programs[0];

      expect(program.interpretations[0].status).toBe(status);
      if (status === "verified") {
        expect(program.categories[0].requirement).toEqual({
          kind: "manualConfirmation",
          label: "Preparation",
          sourceText,
        });
      } else {
        expect(program.categories).toEqual([]);
      }
    }
  });

  it("accepts a pure official course display with footnote decoration", () => {
    const decoratedCourse = {
      ...row(
        "course",
        1,
        "MATH-SHU 121 Calculus 1 4",
        ["MATH-SHU 121"],
        "4",
      ),
      footnoteMarkers: ["1"],
    };
    const decoratedProgram: BulletinProgramDocument = {
      ...programDocument,
      requirementTables: [
        {
          id: "decorated-course",
          sectionId: "requirements",
          rows: [row("areaHeader", 0, "Preparation"), decoratedCourse],
        },
      ],
    };

    const requirement = normalizeBulletin(discovery, [
      subjectDocument,
      decoratedProgram,
    ]).programs[0].categories[0].requirement;

    expect(requirement).toEqual({ kind: "course", courseId: "MATH-SHU 121" });
  });

  it("does not accept title-shaped policy text for a known local course", () => {
    const policyProgram: BulletinProgramDocument = {
      ...programDocument,
      requirementTables: [
        {
          id: "title-shaped-policy",
          sectionId: "requirements",
          rows: [
            row("areaHeader", 0, "Preparation"),
            row(
              "course",
              1,
              "MATH-SHU 121 Permission of Instructor",
              ["MATH-SHU 121"],
              "4",
            ),
          ],
        },
      ],
    };

    const program = normalizeBulletin(discovery, [
      subjectDocument,
      policyProgram,
    ]).programs[0];

    expect(program.categories).toEqual([]);
    expect(program.interpretations[0]).toMatchObject({
      status: "unavailable",
      requirement: null,
    });
  });

  it("keeps unverified external display text unavailable", () => {
    const externalDisplays = [
      "CSCI-UA 101 Permission of Instructor",
      "CSCI-UA 101 Introduction to Computer Science",
    ];

    for (const sourceText of externalDisplays) {
      const externalProgram: BulletinProgramDocument = {
        ...programDocument,
        requirementTables: [
          {
            id: "external-display",
            sectionId: "requirements",
            rows: [
              row("areaHeader", 0, "External Study"),
              row("course", 1, sourceText, ["CSCI-UA 101"], "4"),
            ],
          },
        ],
      };

      const program = normalizeBulletin(discovery, [
        subjectDocument,
        externalProgram,
      ]).programs[0];

      expect(program.categories).toEqual([]);
      expect(program.interpretations[0]).toMatchObject({
        status: "unavailable",
        requirement: null,
      });
    }
  });

  it("compiles an explicit select-two directive without manual fallbacks", () => {
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
      kind: "choose",
      count: 2,
      children: [
        { kind: "course", courseId: "MATH-SHU 235" },
        { kind: "course", courseId: "MATH-SHU 238" },
      ],
    });
  });

  it("stops a directive pool at the next area subheader", () => {
    const boundedDirective: BulletinProgramDocument = {
      ...programDocument,
      requirementTables: [
        {
          id: "bounded-directive",
          sectionId: "requirements",
          rows: [
            row("areaHeader", 0, "Advanced Work"),
            row("areaSubheader", 1, "Select one"),
            row("course", 2, "MATH-SHU 235 Probability", ["MATH-SHU 235"], "4"),
            row("areaSubheader", 3, "Additional Requirement"),
            row("course", 4, "MATH-SHU 121 Calculus", ["MATH-SHU 121"], "4"),
          ],
        },
      ],
    };

    const program = normalizeBulletin(discovery, [
      subjectDocument,
      boundedDirective,
    ]).programs[0];

    expect(program.categories).toEqual([]);
    expect(program.interpretations[0]).toMatchObject({
      status: "unavailable",
      requirement: null,
      diagnostics: [
        expect.objectContaining({ code: "unsupported-structural-row" }),
      ],
    });
  });

  it("recognizes the Bulletin's natural pool-selection phrasings", () => {
    const phrasings: BulletinProgramDocument = {
      ...programDocument,
      requirementTables: [
        {
          id: "pool-phrasings",
          sectionId: "requirements",
          rows: [
            // The real NYU Bulletin writes these as comment rows and appends the
            // pool's credit-hours total to the instruction text.
            row("areaHeader", 0, "Disciplinary Electives"),
            row("comment", 1, "Select two of the following: 8"),
            row("course", 2, "MATH-SHU 235 Probability", ["MATH-SHU 235"], "4"),
            row("course", 3, "MATH-SHU 238 Statistics", ["MATH-SHU 238"], "4"),
            row("course", 4, "MATH-SHU 121 Calculus", ["MATH-SHU 121"], "4"),

            row("areaHeader", 5, "Breadth"),
            row("comment", 6, "Select five elective courses from the list below 20"),
            row("course", 7, "CSCI-SHU 205 Topics", ["CSCI-SHU 205"], "4"),

            row("areaHeader", 8, "Flexible Credits"),
            row("comment", 9, "Complete 8 credits from the following:"),
            row("course", 10, "CSCI-UA 101", ["CSCI-UA 101"], "4"),
          ],
        },
      ],
    };

    const categories = normalizeBulletin(discovery, [
      subjectDocument,
      phrasings,
    ]).programs[0].categories;

    expect(categories[0].requirement).toEqual({
      kind: "choose",
      count: 2,
      children: [
        { kind: "course", courseId: "MATH-SHU 235" },
        { kind: "course", courseId: "MATH-SHU 238" },
        { kind: "course", courseId: "MATH-SHU 121" },
      ],
    });
    expect(categories[1].requirement).toEqual({
      kind: "credits",
      minimum: 8,
      children: [{ kind: "course", courseId: "CSCI-UA 101" }],
    });
    const program = normalizeBulletin(discovery, [
      subjectDocument,
      phrasings,
    ]).programs[0];
    expect(
      program.interpretations.find((item) => item.name === "Breadth"),
    ).toMatchObject({
      status: "unavailable",
      requirement: null,
      diagnostics: [
        expect.objectContaining({ code: "invalid-selector-cardinality" }),
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

  it("supports official parenthesized fixed and variable credits", () => {
    const parenthesizedSubject: BulletinSourceDocument = {
      ...subjectDocument,
      courses: subjectDocument.courses.map((course) => {
        if (course.code === "MATH-SHU 121") {
          return { ...course, creditsText: "(4 Credits)" };
        }
        if (course.code === "MATH-SHU 238") {
          return { ...course, creditsText: "(2-4 Credits)" };
        }
        return course;
      }),
    };

    const courses = new Map(
      normalizeBulletin(discovery, [parenthesizedSubject, programDocument]).courses.map(
        (course) => [course.id, course],
      ),
    );

    expect(courses.get("MATH-SHU 121")).toMatchObject({
      minCredits: 4,
      maxCredits: 4,
    });
    expect(courses.get("MATH-SHU 238")).toMatchObject({
      minCredits: 2,
      maxCredits: 4,
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

  it("preserves references from unavailable requirement rows", () => {
    const manualReference: BulletinProgramDocument = {
      ...programDocument,
      requirementTables: [
        {
          id: "manual-reference",
          sectionId: "requirements",
          rows: [
            row("areaHeader", 0, "Permission"),
            row(
              "course",
              1,
              "MATH-UA 999 or permission of instructor",
              ["MATH-UA 999"],
              "4",
            ),
          ],
        },
      ],
    };

    const candidate = normalizeBulletin(discovery, [
      subjectDocument,
      manualReference,
    ]);

    expect(candidate.programs[0].categories).toEqual([]);
    expect(candidate.programs[0].interpretations[0].status).toBe("unavailable");
    expect(candidate.programs[0].sourceReferenceIds).toEqual(["MATH-UA 999"]);
    expect(candidate.sourceReferenceIds).toContain("MATH-UA 999");
    expect(candidate.externalCourseIds).toEqual(["MATH-UA 999"]);
  });

  it("preserves ambiguous prerequisite references independently of grouping", () => {
    const ambiguousReferences: BulletinSourceDocument = {
      ...subjectDocument,
      courses: subjectDocument.courses.map((course) =>
        course.code === "CSCI-SHU 205"
          ? {
              ...course,
              prerequisiteText:
                "MATH-SHU 999 or placement examination and MATH-UA 999",
              linkedCourseIds: ["MATH-SHU 999", "MATH-UA 999"],
            }
          : course,
      ),
    };

    const candidate = normalizeBulletin(discovery, [
      ambiguousReferences,
      programDocument,
    ]);
    const course = candidate.courses.find(
      (normalized) => normalized.id === "CSCI-SHU 205",
    );

    expect(course?.prereqs).toEqual([]);
    expect(course?.sourceReferenceIds).toEqual([
      "MATH-SHU 999",
      "MATH-UA 999",
    ]);
    expect(candidate.sourceReferenceIds).toEqual(
      expect.arrayContaining(["MATH-SHU 999", "MATH-UA 999"]),
    );
    expect(candidate.unresolvedCourseIds).toEqual(["MATH-SHU 999"]);
    expect(candidate.externalCourseIds).toEqual(
      expect.arrayContaining(["CSCI-UA 101", "MATH-UA 999"]),
    );
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
    const second = normalizeBulletin(discovery, [
      programDocument,
      subjectDocument,
    ]);

    expect(second).toEqual(first);
    expect(first.courses[0].provenance).toMatchObject({
      sourceUrl: SUBJECT_URL,
      snapshotId: first.snapshotId,
      sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(CatalogCandidateSchema.parse(first)).toEqual(first);
  });

  it("normalizes only undergraduate New York records with catalog-only semantics", () => {
    const nyDiscovery = newYorkDiscovery(
      "nyu-new-york-arts-science",
      "csci-ua",
    );
    const sourceUrl = nyDiscovery.coursePageUrls[0];
    const document: BulletinSourceDocument = {
      kind: "subject",
      sourceId: nyDiscovery.sourceId,
      schoolName: nyDiscovery.source.schoolName,
      campus: "new-york",
      slug: "csci-ua",
      title: "Computer Science (CSCI-UA)",
      sourceUrl,
      courses: [
        {
          sourceId: nyDiscovery.sourceId,
          schoolName: nyDiscovery.source.schoolName,
          campus: "new-york",
          code: "CSCI-UA 101",
          title: "Introduction to Computer Science",
          creditText: "2-4 Credits",
          creditsText: "2-4 Credits",
          description: "Computational problem solving.",
          prerequisiteText: "MATH-UA 120",
          offeringText: "Fall and Spring",
          levelText: "Undergraduate",
          crossListTexts: ["DS-UA 101"],
          linkedCourseIds: ["MATH-UA 120"],
          attributes: ["Computing"],
          detailTexts: [],
          detailTextMap: {},
          sourceUrl,
        },
        {
          sourceId: nyDiscovery.sourceId,
          code: "CSCI-GA 1001",
          title: "Graduate Algorithms",
          creditsText: "3 Credits",
          levelText: "Graduate",
          linkedCourseIds: [],
          attributes: [],
          detailTexts: [],
          sourceUrl,
        },
        {
          sourceId: nyDiscovery.sourceId,
          code: "TOPICS 101",
          title: "Unclassified Topics",
          creditsText: "4 Credits",
          levelText: null,
          linkedCourseIds: [],
          attributes: [],
          detailTexts: [],
          sourceUrl,
        },
      ],
    };

    const candidate = normalizeBulletinSource(nyDiscovery, [document]);

    expect(candidate.sourceId).toBe(nyDiscovery.sourceId);
    expect(candidate.programs).toEqual([]);
    expect(candidate.courses).toHaveLength(1);
    expect(candidate.courses[0]).toMatchObject({
      stableId: "nyu-new-york-arts-science:CSCI-UA 101",
      sourceId: nyDiscovery.sourceId,
      code: "CSCI-UA 101",
      subject: "CSCI-UA",
      level: "undergraduate",
      catalogOfferingTerms: ["fall", "spring"],
      catalogOfferingText: "Fall and Spring",
      crossListedStableIds: ["nyu-new-york-arts-science:DS-UA 101"],
      course: {
        id: "CSCI-UA 101",
        minCredits: 2,
        maxCredits: 4,
        sites: ["new-york"],
        offeringKnown: false,
        offered: [],
        fulfills: [],
        prerequisiteText: "MATH-UA 120",
      },
    });
    expect(candidate.quarantinedCourses).toEqual([
      {
        code: "TOPICS 101",
        reason: "no-reliable-level-signal",
        sourceUrl,
      },
    ]);
    expect(candidate.courses.map((record) => record.code)).not.toContain(
      "CSCI-GA 1001",
    );
  });

  it("keeps identical New York codes distinct across source-scoped identities", () => {
    const normalizeFor = (sourceId: string) => {
      const nyDiscovery = newYorkDiscovery(sourceId, "shared-ua");
      const sourceUrl = nyDiscovery.coursePageUrls[0];
      return normalizeBulletinSource(nyDiscovery, [
        {
          kind: "subject",
          slug: "shared-ua",
          title: "Shared Subject",
          sourceUrl,
          courses: [
            {
              sourceId,
              code: "SHARED-UA 101",
              title: "Shared Code",
              creditsText: "4 Credits",
              levelText: "Undergraduate",
              linkedCourseIds: [],
              attributes: [],
              detailTexts: [],
              sourceUrl,
            },
          ],
        },
      ]).courses[0].stableId;
    };

    expect(normalizeFor("nyu-new-york-arts-science")).not.toBe(
      normalizeFor("nyu-new-york-engineering"),
    );
  });
});
