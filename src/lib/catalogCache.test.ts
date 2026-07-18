import { describe, expect, it } from "vitest";
import { CatalogCourseCache, CATALOG_CACHE_KEY } from "@/lib/catalogCache";
import type { CatalogCourseRecord } from "@/lib/catalog/types";

function record(sourceId: string, code: string): CatalogCourseRecord {
  const stableId = `${sourceId}:${code}`;
  return {
    stableId, sourceId, sourceSnapshotId: "snapshot", code, subject: code.split(" ")[0],
    level: "undergraduate", catalogOfferingTerms: [], catalogOfferingText: null,
    course: {
      id: code, title: code, credits: 4, department: code.split(" ")[0], prereqs: [],
      sourceReferenceIds: [], offered: [], offeringKnown: false, sites: ["new-york"],
      fulfills: [], equivalentTo: [], attributes: [], tags: [],
    },
    crossListedStableIds: [],
  };
}

function memoryStorage(initial?: string) {
  const values = new Map<string, string>(initial ? [[CATALOG_CACHE_KEY, initial]] : []);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    values,
  };
}

describe("CatalogCourseCache", () => {
  it("indexes duplicate official codes by distinct stable IDs", () => {
    const cache = new CatalogCourseCache();
    cache.setRelease("release-a");
    cache.upsert([record("source-a", "TEST-UA 1"), record("source-b", "TEST-UA 1")]);
    expect(cache.byOfficialCode("TEST-UA 1").map((item) => item.stableId)).toEqual([
      "source-a:TEST-UA 1", "source-b:TEST-UA 1",
    ]);
  });

  it("retains only pinned records as stale across a release replacement", () => {
    const cache = new CatalogCourseCache();
    const pinned = record("source", "PIN-UA 1");
    const search = record("source", "SEARCH-UA 1");
    cache.setRelease("release-a");
    cache.upsert([pinned, search]);
    cache.pin([pinned.stableId]);
    cache.setRelease("release-b");
    expect(Object.keys(cache.snapshot().byStableId)).toEqual([pinned.stableId]);
    expect(cache.snapshot().staleStableIds).toEqual([pinned.stableId]);
  });

  it("recovers from corrupt storage and persists at most 500 records", () => {
    const storage = memoryStorage("bad-json");
    const cache = new CatalogCourseCache(storage);
    expect(cache.snapshot().byStableId).toEqual({});
    cache.setRelease("release");
    cache.upsert(Array.from({ length: 510 }, (_, index) => record("source", `TEST-UA ${index}`)));
    expect(Object.keys(cache.snapshot().byStableId)).toHaveLength(500);
    const persisted = JSON.parse(storage.values.get(CATALOG_CACHE_KEY)!);
    expect(persisted.records).toHaveLength(500);
  });
});
