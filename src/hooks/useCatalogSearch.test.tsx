// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCatalogSearch } from "@/hooks/useCatalogSearch";
import type { CatalogClient } from "@/lib/catalogClient";
import type { CatalogCourseRecord } from "@/lib/catalog/types";

const context = vi.hoisted(() => ({
  bootstrap: { release: { id: "release" } },
  recordsByStableId: new Map<string, CatalogCourseRecord>(),
  upsertRecords: vi.fn(),
}));
vi.mock("@/components/CatalogProvider", () => ({ useCatalog: () => context }));

function record(code: string): CatalogCourseRecord {
  return {
    stableId: `source:${code}`, sourceId: "source", sourceSnapshotId: "snapshot",
    code, subject: "TEST-UA", level: "undergraduate", catalogOfferingTerms: [],
    catalogOfferingText: null, crossListedStableIds: [],
    course: { id: code, title: code, credits: 4, department: "TEST-UA", prereqs: [],
      sourceReferenceIds: [], offered: [], offeringKnown: false, sites: ["newyork"],
      fulfills: [], equivalentTo: [], attributes: [], tags: [] },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function client(search: CatalogClient["search"]): CatalogClient {
  return { getBootstrap: vi.fn(), search, getCourse: vi.fn(), getCourses: vi.fn() };
}

describe("useCatalogSearch", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/planner");
    context.recordsByStableId.clear();
    context.upsertRecords.mockClear();
  });

  it("aborts a superseded search and ignores its late response", async () => {
    vi.useFakeTimers();
    const first = deferred<Awaited<ReturnType<CatalogClient["search"]>>>();
    const second = deferred<Awaited<ReturnType<CatalogClient["search"]>>>();
    const signals: AbortSignal[] = [];
    const search = vi.fn((_query, signal) => {
      if (signal) signals.push(signal);
      return search.mock.calls.length === 1 ? first.promise : second.promise;
    });
    const { result } = renderHook(() => useCatalogSearch(client(search)));
    act(() => result.current.setQuery({ q: "new" }));
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(signals[0].aborted).toBe(true);
    await act(async () => second.resolve({ releaseId: "release", items: [record("NEW")], nextCursor: null, totalApproximate: 1 }));
    await act(async () => first.resolve({ releaseId: "release", items: [record("OLD")], nextCursor: null, totalApproximate: 1 }));
    expect(result.current.items.map((item) => item.code)).toEqual(["NEW"]);
    vi.useRealTimers();
  });

  it("deduplicates concurrent load-more calls", async () => {
    const more = deferred<Awaited<ReturnType<CatalogClient["search"]>>>();
    const search = vi.fn()
      .mockResolvedValueOnce({ releaseId: "release", items: [record("ONE")], nextCursor: "next", totalApproximate: 2 })
      .mockReturnValueOnce(more.promise);
    const { result } = renderHook(() => useCatalogSearch(client(search)));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let a!: Promise<void>; let b!: Promise<void>;
    act(() => { a = result.current.loadMore(); b = result.current.loadMore(); });
    expect(a).toBe(b);
    await act(async () => more.resolve({ releaseId: "release", items: [record("TWO"), record("ONE")], nextCursor: null, totalApproximate: 2 }));
    expect(result.current.items.map((item) => item.code)).toEqual(["ONE", "TWO"]);
  });

  it("initializes shareable URL state and retries an error", async () => {
    window.history.replaceState({}, "", "/planner?q=math&campus=new-york");
    const search = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce({ releaseId: "release", items: [record("MATH")], nextCursor: null, totalApproximate: 1 });
    const { result } = renderHook(() => useCatalogSearch(client(search)));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.query).toMatchObject({ q: "math", campuses: ["new-york"] });
    await act(async () => result.current.retry());
    expect(result.current.items[0].code).toBe("MATH");
  });

  it("returns matching cached records as stale while offline", async () => {
    context.recordsByStableId.set("source:CACHED", record("CACHED"));
    const api = client(vi.fn(async () => { throw new TypeError("offline"); }));
    const { result } = renderHook(() => useCatalogSearch(api));
    await waitFor(() => expect(result.current.isStale).toBe(true));
    expect(result.current.items[0].code).toBe("CACHED");
    expect(result.current.status).toBe("ready");
  });

  it("restarts from the first page when a release changes mid-query", async () => {
    const search = vi.fn()
      .mockResolvedValueOnce({ releaseId: "retired", items: [record("OLD")], nextCursor: "old", totalApproximate: 1 })
      .mockResolvedValueOnce({ releaseId: "release", items: [record("FRESH")], nextCursor: null, totalApproximate: 1 });
    const { result } = renderHook(() => useCatalogSearch(client(search)));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(search).toHaveBeenCalledTimes(2);
    expect(result.current.items.map((item) => item.code)).toEqual(["FRESH"]);
  });
});
