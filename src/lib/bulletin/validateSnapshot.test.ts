import { describe, expect, it } from "vitest";
import { normalizeBulletin } from "@/lib/bulletin/normalize";
import type { BulletinSourceDocument } from "@/lib/bulletin/parseCoursePage";
import type {
  BulletinProgramDocument,
  SourceTableRow,
} from "@/lib/bulletin/parseProgramPage";
import type { BulletinDiscovery } from "@/lib/bulletin/sourceTypes";
import {
  assertPublishable,
  BulletinValidationError,
  validateCatalogCandidate,
} from "@/lib/bulletin/validateSnapshot";
import type { CatalogCandidate } from "@/lib/types";

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
): SourceTableRow {
  return {
    role,
    sourceIndex,
    text,
    linkedCourseCodes,
    sourceAnchors: [],
    footnoteMarkers: [],
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
      rows: [
        row("areaHeader", 0, "Foundations"),
        row("course", 1, "MATH-SHU 101 Algebra", ["MATH-SHU 101"]),
        row("course", 2, "CSCI-UA 101", ["CSCI-UA 101"]),
        row("comment", 3, "Another course requires advisor approval."),
        row("total", 4, "Total Credits 8"),
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
      code: "MATH-SHU 101",
      title: "Algebra",
      creditsText: "4 Credits",
      offeringText: "Fall",
      linkedCourseIds: [],
      attributes: [],
      detailTexts: [],
    },
    {
      code: "MATH-SHU 201",
      title: "Analysis",
      creditsText: "4 Credits",
      prerequisiteText: "MATH-SHU 101 or placement examination",
      linkedCourseIds: ["MATH-SHU 101"],
      attributes: [],
      detailTexts: [],
    },
  ],
};

function candidate(): CatalogCandidate {
  return structuredClone(
    normalizeBulletin(discovery, [subjectDocument, programDocument]),
  );
}

function codes(report: ReturnType<typeof validateCatalogCandidate>) {
  return report.errors.map((diagnostic) => diagnostic.code);
}

describe("validateCatalogCandidate", () => {
  it("reports safe deterministic counts, hashes, and warning-only ambiguity", () => {
    const input = candidate();

    const report = validateCatalogCandidate(input);

    expect(report.errors).toEqual([]);
    expect(report.warnings.map((warning) => warning.code)).toEqual([
      "manual-confirmation",
      "supported-ambiguity",
    ]);
    expect(report.summary).toEqual({
      snapshotId: input.snapshotId,
      sourceHash: input.sourceHash,
      documentCount: 2,
      courseCount: 2,
      programCount: 1,
      sourceRowCount: 5,
      requirementRowCount: 3,
    });
    expect(validateCatalogCandidate(input)).toEqual(report);
    expect(() => assertPublishable(report)).not.toThrow();
  });

  it.each([
    ["course", "duplicate-course-id"],
    ["program", "duplicate-program-id"],
    ["source", "duplicate-source-id"],
  ] as const)("blocks duplicate %s IDs", (kind, expectedCode) => {
    const input = candidate();
    if (kind === "course") input.courses.push(structuredClone(input.courses[0]));
    if (kind === "program")
      input.programs.push(structuredClone(input.programs[0]));
    if (kind === "source") {
      const duplicateSourceId = structuredClone(input.documents[0]) as {
        sourceUrl: string;
      };
      duplicateSourceId.sourceUrl =
        "https://bulletins.nyu.edu/undergraduate/shanghai/courses/duplicate-url/";
      input.documents.push(duplicateSourceId);
    }

    expect(codes(validateCatalogCandidate(input))).toContain(expectedCode);
  });

  it("blocks an empty catalog", () => {
    const input = candidate();
    input.courses = [];
    input.programs = [];

    expect(codes(validateCatalogCandidate(input))).toContain("empty-catalog");
  });

  it("blocks missing course, program, and source titles", () => {
    const input = candidate();
    input.courses[0].title = "   ";
    input.programs[0].name = "";
    (input.documents[0] as { title: string }).title = "";

    expect(codes(validateCatalogCandidate(input))).toEqual(
      expect.arrayContaining(["missing-title", "missing-title", "missing-title"]),
    );
  });

  it("blocks provenance pages that were not fetched", () => {
    const input = candidate();
    input.documents = input.documents.filter(
      (document) =>
        (document as { sourceUrl?: string }).sourceUrl !== SUBJECT_URL,
    );

    expect(codes(validateCatalogCandidate(input))).toContain(
      "missing-fetched-page",
    );
  });

  it("blocks fetched pages that have no discovered catalog provenance", () => {
    const input = candidate();
    input.documents.push({
      ...subjectDocument,
      slug: "orphan-shu",
      title: "Orphan (ORPH-SHU)",
      sourceUrl:
        "https://bulletins.nyu.edu/undergraduate/shanghai/courses/orphan-shu/",
    });

    expect(codes(validateCatalogCandidate(input))).toContain(
      "missing-discovered-page",
    );
  });

  it("blocks any gap or duplicate in exact source-row coverage", () => {
    const missing = candidate();
    missing.programs[0].sourceRows.splice(1, 1);
    const duplicate = candidate();
    duplicate.programs[0].sourceRows.push(
      structuredClone(duplicate.programs[0].sourceRows[1]),
    );

    expect(codes(validateCatalogCandidate(missing))).toContain(
      "source-row-coverage",
    );
    expect(codes(validateCatalogCandidate(duplicate))).toContain(
      "source-row-coverage",
    );
  });

  it("blocks a requirement row that no longer maps to its category AST", () => {
    const input = candidate();
    input.programs[0].requirementRows[0].node = {
      kind: "course",
      courseId: "MATH-SHU 201",
    };

    expect(codes(validateCatalogCandidate(input))).toContain(
      "source-row-coverage",
    );
  });

  it("blocks unresolved local references, including executable references", () => {
    const unresolved = candidate();
    unresolved.sourceReferenceIds.push("MATH-SHU 998");
    unresolved.unresolvedCourseIds.push("MATH-SHU 998");

    const executable = candidate();
    executable.programs[0].categories[0].requirement = {
      kind: "course",
      courseId: "MATH-SHU 999",
    };

    expect(codes(validateCatalogCandidate(unresolved))).toContain(
      "unresolved-local-reference",
    );
    expect(codes(validateCatalogCandidate(executable))).toContain(
      "broken-executable-reference",
    );
  });

  it("allows explicit external NYU references without fabricating a course", () => {
    const input = candidate();

    expect(input.externalCourseIds).toContain("CSCI-UA 101");
    expect(input.courses.some((course) => course.id === "CSCI-UA 101")).toBe(
      false,
    );
    expect(validateCatalogCandidate(input).errors).toEqual([]);
  });

  it("blocks an unclassified external executable reference", () => {
    const input = candidate();
    input.programs[0].categories[0].requirement = {
      kind: "course",
      courseId: "CSCI-UA 999",
    };

    expect(codes(validateCatalogCandidate(input))).toContain(
      "broken-executable-reference",
    );
  });

  it("sorts diagnostics by code then source URL", () => {
    const input = candidate();
    input.courses.push(
      { ...structuredClone(input.courses[0]), provenance: undefined },
      { ...structuredClone(input.courses[1]), id: input.courses[0].id },
    );

    const report = validateCatalogCandidate(input);
    const keys = report.errors.map(
      ({ code, sourceUrl = "" }) => `${code}\u0000${sourceUrl}`,
    );

    expect(keys).toEqual([...keys].sort());
  });

  it("reports malformed unknown source documents instead of throwing", () => {
    const input = candidate();
    input.documents = [
      {
        kind: "program",
        sourceUrl: PROGRAM_URL,
        rawHtml: "<html>secret source body</html>",
      },
    ];

    const report = validateCatalogCandidate(input);

    expect(report.errors.map((error) => error.code)).toContain(
      "invalid-source-document",
    );
    expect(() => assertPublishable(report)).toThrow(BulletinValidationError);
  });
});

describe("assertPublishable", () => {
  it("throws only safe diagnostic codes and never source document content", () => {
    const input = candidate();
    (input.documents[0] as Record<string, unknown>).rawHtml =
      "<script>secret-token</script>";
    input.courses.push(structuredClone(input.courses[0]));
    const report = validateCatalogCandidate(input);

    const error = (() => {
      try {
        assertPublishable(report);
      } catch (cause) {
        return cause;
      }
    })();

    expect(error).toBeInstanceOf(BulletinValidationError);
    expect((error as BulletinValidationError).codes).toContain(
      "duplicate-course-id",
    );
    expect((error as Error).message).not.toContain("secret-token");
    expect((error as Error).message).not.toContain("<script>");
  });
});
