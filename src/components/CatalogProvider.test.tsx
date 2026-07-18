// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogProvider, useCatalog } from "@/components/CatalogProvider";
import { CatalogCourseCache } from "@/lib/catalogCache";
import type { CatalogClient } from "@/lib/catalogClient";
import type { CatalogBootstrapResponse } from "@/lib/catalog/contracts";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import { usePlannerStore } from "@/store/plannerStore";

const bootstrap = (releaseId = "release-a"): CatalogBootstrapResponse => ({
  release: {
    id: releaseId,
    sourceSnapshotIds: { "nyu-shanghai": "snapshot-a" },
    publishedAt: "2026-07-18T00:00:00.000Z",
  },
  programs: [],
  rules: [],
  sources: [{
    id: "nyu-shanghai",
    schoolName: "NYU Shanghai",
    campus: "shanghai",
    courseCount: 1,
    status: "healthy",
  }],
  sites: [],
  filters: { subjects: [], catalogTerms: [], creditBounds: [0, 4] },
});

function record(code = "TEST-SHU 1"): CatalogCourseRecord {
  return {
    stableId: `nyu-shanghai:${code}`,
    sourceId: "nyu-shanghai",
    sourceSnapshotId: "snapshot-a",
    code,
    subject: "TEST-SHU",
    level: "undergraduate",
    catalogOfferingTerms: [],
    catalogOfferingText: null,
    course: {
      id: code,
      title: code,
      credits: 4,
      department: "TEST-SHU",
      prereqs: [],
      sourceReferenceIds: [],
      offered: [],
      offeringKnown: false,
      sites: ["shanghai"],
      fulfills: [],
      equivalentTo: [],
      attributes: [],
      tags: [],
    },
    crossListedStableIds: [],
  };
}

function client(overrides: Partial<CatalogClient> = {}): CatalogClient {
  return {
    getBootstrap: vi.fn(async () => bootstrap()),
    search: vi.fn(),
    getCourse: vi.fn(),
    getCourses: vi.fn(async (stableIds: string[]) => ({
      releaseId: "release-a",
      items: stableIds.map((id) => record(id.split(":").slice(1).join(":"))),
      missingStableIds: [],
    })),
    ...overrides,
  };
}

function Summary() {
  const catalog = useCatalog();
  return (
    <p>
      {catalog.status}:{catalog.recordsByStableId.size}:
      {catalog.getRecord("nyu-shanghai:TEST-SHU 1")?.code ?? "missing"}
    </p>
  );
}

describe("CatalogProvider", () => {
  beforeEach(() => {
    usePlannerStore.setState({ placements: [], customCourses: [] });
  });

  it("fetches only bootstrap on mount", async () => {
    const api = client();
    render(<CatalogProvider client={api} cache={new CatalogCourseCache()}><Summary /></CatalogProvider>);
    await screen.findByText("ready:0:missing");
    expect(api.getBootstrap).toHaveBeenCalledOnce();
    expect(api.search).not.toHaveBeenCalled();
    expect(api.getCourse).not.toHaveBeenCalled();
    expect(api.getCourses).not.toHaveBeenCalled();
  });

  it("hydrates cache and discards stale unpinned records after release change", async () => {
    const pinned = record();
    const unpinned = record("DROP-SHU 1");
    const cache = new CatalogCourseCache();
    cache.setRelease("release-old");
    cache.upsert([pinned, unpinned]);
    usePlannerStore.setState({
      placements: [{
        courseId: pinned.code,
        catalogCourseId: pinned.stableId,
        semesterId: "Y1F",
        allocation: "auto",
      }],
    } as never);

    render(<CatalogProvider client={client()} cache={cache}><Summary /></CatalogProvider>);
    expect(screen.getByText("loading:2:TEST-SHU 1")).toBeTruthy();
    await screen.findByText("ready:1:TEST-SHU 1");
    expect(cache.get(unpinned.stableId)).toBeUndefined();
    expect(cache.snapshot().staleStableIds).toEqual([pinned.stableId]);
  });

  it("batches missing pinned placement IDs", async () => {
    usePlannerStore.setState({
      placements: [{
        courseId: "TEST-SHU 1",
        catalogCourseId: "nyu-shanghai:TEST-SHU 1",
        semesterId: "Y1F",
        allocation: "auto",
      }],
    } as never);
    const api = client();
    render(<CatalogProvider client={api} cache={new CatalogCourseCache()}><Summary /></CatalogProvider>);
    await screen.findByText("ready:1:TEST-SHU 1");
    expect(api.getCourses).toHaveBeenCalledWith(
      ["nyu-shanghai:TEST-SHU 1"],
      expect.any(AbortSignal),
    );
  });

  it("surfaces stale cached data when bootstrap is offline", async () => {
    const cache = new CatalogCourseCache();
    cache.setRelease("release-a");
    cache.upsert([record()]);
    const api = client({ getBootstrap: vi.fn(async () => { throw new TypeError("offline"); }) });
    render(<CatalogProvider client={api} cache={cache}><Summary /></CatalogProvider>);
    await waitFor(() => expect(screen.getByText("stale:1:TEST-SHU 1")).toBeTruthy());
  });

  it("aborts bootstrap work on unmount", () => {
    let signal: AbortSignal | undefined;
    const api = client({
      getBootstrap: vi.fn((nextSignal) => {
        signal = nextSignal;
        return new Promise<CatalogBootstrapResponse>(() => undefined);
      }),
    });
    const view = render(<CatalogProvider client={api} cache={new CatalogCourseCache()}><Summary /></CatalogProvider>);
    act(() => view.unmount());
    expect(signal?.aborted).toBe(true);
  });
});
