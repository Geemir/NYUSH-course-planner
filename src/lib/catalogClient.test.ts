import { describe, expect, it } from "vitest";
import {
  catalogValueFromResponse,
  selectActiveCatalogPrograms,
} from "@/lib/catalogClient";
import { CATALOG_FALLBACK } from "@/lib/data";

describe("client catalog program boundary", () => {
  it("preserves legacy fallback programs explicitly", () => {
    const value = catalogValueFromResponse(CATALOG_FALLBACK);

    expect(value.snapshot.kind).toBe("bootstrap-legacy");
    expect(value.programs).toEqual(CATALOG_FALLBACK.programs);
    expect(value.programs.length).toBeGreaterThan(0);
  });

  it("selects active rich Bulletin programs for the planner engines", () => {
    const snapshotId = "live-bulletin";
    const sourceUrl =
      "https://bulletins.nyu.edu/undergraduate/shanghai/programs/test/";
    const response = {
      snapshot: {
        id: snapshotId,
        sourceHash: "hash",
        kind: "bulletin" as const,
        publishedAt: "2026-07-15T00:00:00.000Z",
      },
      courses: [
        {
          id: "TEST-SHU 101",
          title: "Test Course",
          credits: 4,
          department: "TEST-SHU",
          prereqs: [],
          sourceReferenceIds: [],
          offered: ["fall" as const],
          offeringKnown: true,
          sites: ["shanghai"],
          fulfills: [{ programId: "test", categoryId: "foundation" }],
          equivalentTo: [],
          attributes: [],
          tags: [],
          provenance: { sourceUrl, snapshotId, sourceHash: "hash" },
        },
      ],
      programs: [
        {
          id: "test",
          name: "Test Program",
          shortName: "Test",
          type: "major" as const,
          categories: [
            {
              id: "foundation",
              name: "Foundation",
              requirement: { kind: "course" as const, courseId: "TEST-SHU 101" },
              sourceUrl,
              sourceTableId: "requirements",
              sourceRowIndexes: [0],
            },
          ],
          requirementRows: [
            {
              sourceUrl,
              tableId: "requirements",
              sourceIndex: 0,
              sourceText: "TEST-SHU 101 Test Course",
              categoryId: "foundation",
              nodePath: [],
              node: { kind: "course" as const, courseId: "TEST-SHU 101" },
            },
          ],
          sourceRows: [
            {
              representation: "requirementNode" as const,
              sourceUrl,
              tableId: "requirements",
              sourceIndex: 0,
              sourceText: "TEST-SHU 101 Test Course",
              categoryId: "foundation",
              nodePath: [],
            },
          ],
          sourceReferenceIds: ["TEST-SHU 101"],
          provenance: { sourceUrl, snapshotId, sourceHash: "hash" },
        },
      ],
      rules: [],
    };

    const value = catalogValueFromResponse(response);
    const selected = selectActiveCatalogPrograms(value.programs, ["test"]);

    expect(value.snapshot.kind).toBe("bulletin");
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      id: "test",
      categories: [
        expect.objectContaining({
          requirement: { kind: "course", courseId: "TEST-SHU 101" },
        }),
      ],
    });
    expect("rule" in selected[0].categories[0]).toBe(false);
  });
});
