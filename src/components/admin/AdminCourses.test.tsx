// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminCourses } from "@/components/admin/AdminCourses";
import type { CatalogClient } from "@/lib/catalogClient";
import type { CatalogCourseRecord } from "@/lib/catalog/types";

const record: CatalogCourseRecord = {
  stableId: "stern:TEST-UA 1", sourceId: "stern", sourceSnapshotId: "snapshot",
  code: "TEST-UA 1", subject: "TEST-UA", level: "undergraduate",
  catalogOfferingTerms: [], catalogOfferingText: null, crossListedStableIds: [],
  course: { id: "TEST-UA 1", title: "Immutable Seminar", credits: 4, department: "TEST-UA",
    prereqs: [], sourceReferenceIds: [], offered: [], offeringKnown: false, sites: ["newyork"],
    fulfills: [], equivalentTo: [], attributes: [], tags: [] },
};

function client(search: CatalogClient["search"]): CatalogClient {
  return { getBootstrap: vi.fn(), search, getCourse: vi.fn(), getCourses: vi.fn() };
}

describe("AdminCourses", () => {
  afterEach(() => vi.useRealTimers());

  it("uses bounded query search and keeps Bulletin records immutable", async () => {
    vi.useFakeTimers();
    const search = vi.fn(async () => ({ releaseId: "release", items: [record], nextCursor: null, totalApproximate: 1 }));
    render(<AdminCourses client={client(search)} />);
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ q: "", limit: 40 }), expect.any(AbortSignal));
    expect(screen.getByText("Immutable Seminar")).toBeTruthy();
    expect(screen.getByText(/Immutable Bulletin records/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Remove TEST-UA 1/ })).toBeNull();
    expect(screen.getByText(/Manual imports are separate reviewed records/)).toBeTruthy();
  });

  it("debounces code and title lookup", async () => {
    vi.useFakeTimers();
    const search = vi.fn(async () => ({ releaseId: "release", items: [], nextCursor: null, totalApproximate: 0 }));
    render(<AdminCourses client={client(search)} />);
    await act(async () => vi.advanceTimersByTimeAsync(200));
    search.mockClear();
    fireEvent.change(screen.getByRole("textbox", { name: "Search immutable Bulletin courses" }), {
      target: { value: "math" },
    });
    expect(search).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ q: "math" }), expect.any(AbortSignal));
  });
});
