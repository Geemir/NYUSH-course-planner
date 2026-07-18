import { describe, expect, it } from "vitest";
import {
  CatalogCourseBatchRequestSchema,
  CatalogCourseQuerySchema,
  catalogCourseQueryToSearchParams,
  decodeCatalogCursor,
  encodeCatalogCursor,
  parseCatalogCourseSearchParams,
} from "@/lib/catalog/contracts";

describe("catalog query contracts", () => {
  it("applies bounded defaults and parses repeated URL filters", () => {
    expect(CatalogCourseQuerySchema.parse({})).toMatchObject({
      q: "",
      campuses: [],
      sourceIds: [],
      subjects: [],
      levels: ["undergraduate"],
      catalogTerms: [],
      limit: 40,
    });
    expect(
      parseCatalogCourseSearchParams(
        new URLSearchParams(
          "q=%20computer%20&campus=new-york&source=stern&subject=CSCI-UA&catalogTerm=Fall&limit=20",
        ),
      ),
    ).toMatchObject({
      q: "computer",
      campuses: ["new-york"],
      sourceIds: ["stern"],
      subjects: ["CSCI-UA"],
      catalogTerms: ["Fall"],
      limit: 20,
    });
  });

  it("rejects unknown keys, excessive limits, and inverted credit ranges", () => {
    expect(() => CatalogCourseQuerySchema.parse({ unknown: true })).toThrow();
    expect(() => CatalogCourseQuerySchema.parse({ limit: 101 })).toThrow();
    expect(() =>
      CatalogCourseQuerySchema.parse({ minCredits: 4, maxCredits: 2 }),
    ).toThrow();
  });

  it("serializes set-like filters deterministically", () => {
    const params = catalogCourseQueryToSearchParams(
      CatalogCourseQuerySchema.parse({
        campuses: ["new-york", "shanghai"],
        subjects: ["MATH-UA", "CSCI-UA", "MATH-UA"],
      }),
    );
    expect(params.getAll("campus")).toEqual(["new-york", "shanghai"]);
    expect(params.getAll("subject")).toEqual(["CSCI-UA", "MATH-UA"]);
  });

  it("round-trips opaque release-bound cursors and rejects another release", () => {
    const cursor = encodeCatalogCursor({
      releaseId: "release-a",
      code: "CSCI-UA 101",
      stableId: "source:CSCI-UA 101",
    });
    expect(decodeCatalogCursor(cursor, "release-a")).toMatchObject({
      code: "CSCI-UA 101",
    });
    expect(() => decodeCatalogCursor(cursor, "release-b")).toThrow();
  });

  it("deduplicates batches in first-seen order and caps them at 100", () => {
    expect(
      CatalogCourseBatchRequestSchema.parse({ stableIds: ["b", "a", "b"] }),
    ).toEqual({ stableIds: ["b", "a"] });
    expect(() =>
      CatalogCourseBatchRequestSchema.parse({
        stableIds: Array.from({ length: 101 }, (_, index) => `id-${index}`),
      }),
    ).toThrow();
  });
});
