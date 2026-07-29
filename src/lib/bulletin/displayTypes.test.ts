import { describe, expect, it } from "vitest";
import {
  BulletinRequirementDocumentSchema,
  BulletinSamplePlanSchema,
} from "@/lib/bulletin/displayTypes";

describe("Bulletin display contracts", () => {
  it("preserves ordered table rows and the nearest heading trail", () => {
    const parsed = BulletinRequirementDocumentSchema.parse({
      schemaVersion: 2,
      sourceUrl:
        "https://bulletins.nyu.edu/undergraduate/shanghai/programs/data-science-bs/",
      sections: [
        {
          id: "curriculumtextcontainer",
          heading: "Program Requirements",
          blocks: [
            {
              kind: "table",
              id: "finance-table",
              caption: "Course List",
              headingTrail: [{ level: 3, text: "Finance" }],
              rows: [
                {
                  sourceIndex: 0,
                  role: "directive",
                  text: "Select one of the following:",
                  creditsText: "4",
                  linkedCourseCodes: [],
                  sourceAnchors: [],
                  footnoteMarkers: [],
                },
                {
                  sourceIndex: 1,
                  role: "course",
                  text: "MATH-SHU 235 Probability and Statistics",
                  creditsText: null,
                  linkedCourseCodes: ["MATH-SHU 235"],
                  sourceAnchors: ["/search/?P=MATH-SHU%20235"],
                  footnoteMarkers: [],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(parsed.sections[0].blocks[0]).toMatchObject({
      kind: "table",
      headingTrail: [{ level: 3, text: "Finance" }],
      rows: [{ role: "directive" }, { role: "course" }],
    });
  });

  it("distinguishes exact sample-plan courses from planning placeholders", () => {
    const parsed = BulletinSamplePlanSchema.parse({
      sectionId: "sampleplanofstudytextcontainer",
      heading: "Sample Plan of Study",
      terms: [
        {
          sourceIndex: 0,
          heading: "1st Semester/Term",
          ordinal: 1,
          creditsText: "16",
          rows: [
            {
              kind: "course",
              sourceIndex: 0,
              text: "MATH-SHU 131 Calculus",
              creditsText: "4",
              linkedCourseCodes: ["MATH-SHU 131"],
              sourceAnchors: ["/search/?P=MATH-SHU%20131"],
            },
            {
              kind: "placeholder",
              sourceIndex: 1,
              label: "Chinese or EAP",
              creditsText: "4",
            },
          ],
        },
      ],
      totalCreditsText: "128",
      importStatus: "display-only",
      diagnostics: [
        {
          code: "nonstandard-term-count",
          message: "Sample plan has 1 term instead of 8.",
        },
      ],
    });

    expect(parsed.importStatus).toBe("display-only");
    expect(parsed.terms[0].rows.map((row) => row.kind)).toEqual([
      "course",
      "placeholder",
    ]);
  });
});
