import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  search: vi.fn(),
  batch: vi.fn(),
  detail: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/catalog/searchRepository", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/catalog/searchRepository")
  >();
  return {
    ...actual,
    readCatalogBootstrap: stubs.bootstrap,
    searchCatalogCourses: stubs.search,
    readCatalogCourseBatch: stubs.batch,
    readCatalogCourse: stubs.detail,
  };
});

import { CatalogUnavailableError } from "@/lib/catalog/searchRepository";
import { GET as bootstrapGET } from "@/app/api/catalog/bootstrap/route";
import { GET as searchGET } from "@/app/api/catalog/courses/route";
import { POST as batchPOST } from "@/app/api/catalog/courses/batch/route";
import { GET as detailGET } from "@/app/api/catalog/courses/[stableId]/route";
import { GET as legacyGET } from "@/app/api/catalog/route";

describe("catalog route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubs.bootstrap.mockResolvedValue({ release: { id: "release" } });
    stubs.search.mockResolvedValue({
      releaseId: "release",
      items: [],
      nextCursor: null,
      totalApproximate: null,
    });
    stubs.batch.mockResolvedValue({
      releaseId: "release",
      items: [],
      missingStableIds: [],
    });
    stubs.detail.mockResolvedValue(null);
  });

  it("serves bootstrap at request time with private no-store headers", async () => {
    const response = await bootstrapGET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(await response.json()).not.toHaveProperty("courses");
  });

  it("validates search queries and maps unavailable catalogs safely", async () => {
    const invalid = await searchGET(
      new Request("http://localhost/api/catalog/courses?limit=101"),
    );
    expect(invalid.status).toBe(400);
    expect(stubs.search).not.toHaveBeenCalled();

    stubs.search.mockRejectedValue(new CatalogUnavailableError());
    const unavailable = await searchGET(
      new Request("http://localhost/api/catalog/courses?q=math"),
    );
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: "catalog_unavailable" });
  });

  it("validates batch JSON and returns a stable detail 404", async () => {
    const invalidBatch = await batchPOST(
      new Request("http://localhost/api/catalog/courses/batch", {
        method: "POST",
        body: "not-json",
      }),
    );
    expect(invalidBatch.status).toBe(400);

    const missing = await detailGET(
      new Request("http://localhost/api/catalog/courses/source:missing"),
      {
        params: Promise.resolve({ stableId: "source:missing" }),
      } as RouteContext<"/api/catalog/courses/[stableId]">,
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "course_not_found" });
  });

  it("redirects the retired full-catalog endpoint to bootstrap", async () => {
    const response = await legacyGET(new Request("http://localhost/api/catalog"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "http://localhost/api/catalog/bootstrap",
    );
  });
});
