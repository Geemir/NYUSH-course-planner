import { describe, expect, it, vi } from "vitest";
import {
  CatalogClientError,
  createCatalogClient,
  selectActiveCatalogPrograms,
} from "@/lib/catalogClient";
import { CatalogCourseQuerySchema } from "@/lib/catalog/contracts";

describe("client catalog program boundary", () => {
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
          auditAuthority: "nyush-bulletin" as const,
          eligibleProfileRoles: ["primaryMajor" as const, "secondMajor" as const],
        },
      ],
      rules: [],
    };

    const selected = selectActiveCatalogPrograms(response.programs, ["test"]);

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

describe("typed catalog client", () => {
  it("serializes search state and propagates AbortSignal", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ releaseId: "release", items: [], nextCursor: null, totalApproximate: null }),
    );
    const controller = new AbortController();
    await createCatalogClient(fetcher as typeof fetch).search(
      CatalogCourseQuerySchema.parse({ q: " computer ", campuses: ["new-york"] }),
      controller.signal,
    );
    expect(fetcher).toHaveBeenCalledWith(
      "/api/catalog/courses?q=computer&campus=new-york&level=undergraduate",
      { signal: controller.signal },
    );
  });

  it.each([
    [400, "invalid-request"],
    [404, "not-found"],
    [503, "unavailable"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    const client = createCatalogClient(
      vi.fn(async () => new Response("{}", { status })) as typeof fetch,
    );
    const error = await client
      .search(CatalogCourseQuerySchema.parse({}))
      .catch((cause) => cause);
    expect(error).toBeInstanceOf(CatalogClientError);
    expect(error.code).toBe(code);
  });

  it("rejects invalid successful JSON without retrying", async () => {
    const fetcher = vi.fn(async () => Response.json({ wrong: true }));
    await expect(
      createCatalogClient(fetcher as typeof fetch).search(
        CatalogCourseQuerySchema.parse({}),
      ),
    ).rejects.toMatchObject({ code: "invalid-response" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
