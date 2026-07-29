import { describe, expect, it } from "vitest";
import {
  CatalogCourseRecordSchema,
  CatalogReleaseRefSchema,
  CatalogSourceDefinitionSchema,
} from "@/lib/catalog/types";
import { CatalogProgramSchema } from "@/lib/types";

const course = {
  id: "CSCI-UA 101",
  title: "Introduction to Computer Science",
  credits: 4,
  department: "CSCI-UA",
  prereqs: [],
  sourceReferenceIds: [],
  offered: [],
  offeringKnown: false,
  sites: ["new-york"],
  fulfills: [],
  equivalentTo: [],
  attributes: [],
  tags: [],
};

describe("catalog domain schemas", () => {
  it("parses a strict source definition", () => {
    expect(
      CatalogSourceDefinitionSchema.parse({
        id: "nyu-new-york-arts-science",
        schoolName: "College of Arts and Science",
        campus: "new-york",
        bulletinRoot:
          "https://bulletins.nyu.edu/undergraduate/arts-science/",
        courseIndexUrl:
          "https://bulletins.nyu.edu/undergraduate/arts-science/courses/",
        includePrograms: false,
        enabled: true,
      }),
    ).toMatchObject({ campus: "new-york", includePrograms: false });
  });

  it("parses a source-scoped course record without changing the official id", () => {
    const record = CatalogCourseRecordSchema.parse({
      stableId: "nyu-new-york-arts-science:CSCI-UA 101",
      sourceId: "nyu-new-york-arts-science",
      sourceSnapshotId: "snapshot-cas",
      code: "CSCI-UA 101",
      subject: "CSCI-UA",
      level: "undergraduate",
      catalogOfferingTerms: ["Fall"],
      catalogOfferingText: "Typically offered in the fall",
      course,
      crossListedStableIds: [],
    });

    expect(record.course.id).toBe("CSCI-UA 101");
  });

  it("rejects a release without a source snapshot", () => {
    expect(() =>
      CatalogReleaseRefSchema.parse({
        id: "release-1",
        sourceSnapshotIds: {},
        publishedAt: "2026-07-18T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("backfills NYUSH program authority from the program kind", () => {
    const program = CatalogProgramSchema.parse({
      id: "computer-science",
      name: "Computer Science",
      shortName: "CS",
      type: "major",
      categories: [],
      requirementRows: [],
      sourceRows: [],
      sourceReferenceIds: [],
      provenance: {
        sourceUrl:
          "https://bulletins.nyu.edu/undergraduate/shanghai/programs/computer-science-bs/",
        snapshotId: "snapshot-shanghai",
        sourceHash: "hash",
      },
    });

    expect(program.auditAuthority).toBe("nyush-bulletin");
    expect(program.eligibleProfileRoles).toEqual([
      "primaryMajor",
      "secondMajor",
    ]);
    expect(program.interpretations).toEqual([]);
  });

  it("requires verified interpretations to contain an executable AST", () => {
    expect(() =>
      CatalogProgramSchema.parse({
        id: "computer-science",
        name: "Computer Science",
        shortName: "CS",
        type: "major",
        categories: [],
        interpretations: [
          {
            id: "probability",
            name: "Probability",
            status: "verified",
            requirement: null,
            sourceTableIds: ["requirements"],
            sourceRowRefs: [{ tableId: "requirements", sourceIndex: 1 }],
            diagnostics: [],
          },
        ],
        requirementRows: [],
        sourceRows: [],
        sourceReferenceIds: [],
        provenance: {
          sourceUrl:
            "https://bulletins.nyu.edu/undergraduate/shanghai/programs/computer-science-bs/",
          snapshotId: "snapshot-shanghai",
          sourceHash: "hash",
        },
      }),
    ).toThrow(/verified interpretations require/i);
  });
});
