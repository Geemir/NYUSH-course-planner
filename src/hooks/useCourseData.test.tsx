// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogProvider } from "@/components/CatalogProvider";
import { useCourseData } from "@/hooks/useCourseData";
import { CatalogCourseCache } from "@/lib/catalogCache";
import type { CatalogClient } from "@/lib/catalogClient";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import { usePlannerStore } from "@/store/plannerStore";

function record(sourceId: string, title: string): CatalogCourseRecord {
  return {
    stableId: `${sourceId}:TEST-UA 1`, sourceId, sourceSnapshotId: "snapshot",
    code: "TEST-UA 1", subject: "TEST-UA", level: "undergraduate",
    catalogOfferingTerms: [], catalogOfferingText: null,
    course: {
      id: "TEST-UA 1", title, credits: 4, department: "TEST-UA", prereqs: [],
      sourceReferenceIds: [], offered: [], offeringKnown: false, sites: ["newyork"],
      fulfills: [], equivalentTo: [], attributes: [], tags: [],
    },
    crossListedStableIds: [],
  };
}

const bootstrap = {
  release: { id: "release", sourceSnapshotIds: { a: "snapshot" }, publishedAt: "2026-07-18T00:00:00.000Z" },
  programs: [], rules: [], sources: [], sites: [],
  filters: { subjects: [], catalogTerms: [], creditBounds: [0, 4] as [number, number] },
};

describe("useCourseData", () => {
  beforeEach(() => usePlannerStore.setState({ customCourses: [], placements: [] }));

  it("keeps stable identities and refuses to collapse duplicate official codes", async () => {
    const first = record("school-a", "School A");
    const second = record("school-b", "School B");
    const cache = new CatalogCourseCache();
    cache.setRelease("release");
    cache.upsert([first, second]);
    const api: CatalogClient = {
      getBootstrap: vi.fn(async () => bootstrap), search: vi.fn(),
      getCourse: vi.fn(), getCourses: vi.fn(),
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CatalogProvider client={api} cache={cache}>{children}</CatalogProvider>
    );
    const { result } = renderHook(() => useCourseData(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.records).toHaveLength(2);
    expect(result.current.courseByStableId.get(first.stableId)?.title).toBe("School A");
    expect(result.current.coursesByOfficialCode.get("TEST-UA 1")).toHaveLength(2);
    expect(result.current.coursesById.has("TEST-UA 1")).toBe(false);
  });

  it("lets a validated custom course explicitly override its official code", async () => {
    const cache = new CatalogCourseCache();
    cache.setRelease("release");
    cache.upsert([record("school-a", "Bulletin")]);
    usePlannerStore.setState({ customCourses: [{
      id: "TEST-UA 1", title: "My version", credits: 4, department: "Custom",
      offered: [], offeringKnown: false, sites: ["newyork"],
    }] as never });
    const api: CatalogClient = {
      getBootstrap: vi.fn(async () => bootstrap), search: vi.fn(),
      getCourse: vi.fn(), getCourses: vi.fn(),
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CatalogProvider client={api} cache={cache}>{children}</CatalogProvider>
    );
    const { result } = renderHook(() => useCourseData(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.coursesById.get("TEST-UA 1")?.title).toBe("My version");
    expect(result.current.customIds.has("TEST-UA 1")).toBe(true);
  });
});
