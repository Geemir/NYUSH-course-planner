import { describe, expect, it } from "vitest";
import { evaluateCertification } from "./certify-nyush-programs";
import type { CatalogProgram } from "@/lib/types";
import type { ProgramGoldenExpectation } from "@/lib/bulletin/certifyPrograms";
import goldenManifest from "@/data/nyush-program-golden.json";

describe("NYUSH golden certification", () => {
  it("requires all 43 expected programs", () => {
    const golden: ProgramGoldenExpectation[] = Array.from({ length: 43 }, (_, index) => ({ programId: `program-${index}`, tableHeadings: [], categoryNames: [], selectors: [], manualConditions: [], unavailableGroups: [], samplePlanTermCount: 0 }));
    const programs = golden.map((item) => ({
      id: item.programId, name: item.programId, shortName: item.programId, type: "major", categories: [], interpretations: [], requirementRows: [], sourceRows: [], sourceReferenceIds: [],
      provenance: { sourceUrl: `https://bulletins.nyu.edu/undergraduate/shanghai/programs/${item.programId}/`, snapshotId: "snapshot", sourceHash: "hash" },
      auditAuthority: "nyush-bulletin", eligibleProfileRoles: ["primaryMajor", "secondMajor"], reviewedOverlayIds: [], reviewedNotes: [],
    })) as CatalogProgram[];
    expect(evaluateCertification(golden, programs)).toMatchObject({ status: "pass", programCount: 43, passed: 43 });
  });

  it("pins the reviewed Data Science selectors and Computer Science sample plan", () => {
    const dataScience = goldenManifest.find((item) => item.programId === "data-science-bs")!;
    const computerScience = goldenManifest.find((item) => item.programId === "computer-science-bs")!;

    expect(dataScience.selectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ count: 1, childCount: 2 }),
        expect.objectContaining({ count: 1, childCount: 8 }),
      ]),
    );
    expect(dataScience.unavailableGroups).not.toContain("Major Requirements");
    expect(computerScience).toMatchObject({
      samplePlanTermCount: 8,
      selectors: [expect.objectContaining({ count: 4, childCount: 26 })],
    });
  });
});
