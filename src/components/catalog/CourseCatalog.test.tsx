// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourseCatalog } from "@/components/catalog/CourseCatalog";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import { render, screen } from "@/test/render";

const mocks = vi.hoisted(() => ({
  search: {
    query: { q: "", campuses: [], sourceIds: [], subjects: [], levels: ["undergraduate"], catalogTerms: [], limit: 40 },
    items: [] as CatalogCourseRecord[], status: "ready", error: null, nextCursor: null as string | null,
    isStale: false, setQuery: vi.fn(), loadMore: vi.fn(), retry: vi.fn(),
  },
  catalog: {
    bootstrap: {
      release: { id: "release", publishedAt: "2026-07-18T00:00:00.000Z" },
      sources: [{ id: "stern", schoolName: "NYU Stern", campus: "new-york", courseCount: 1, status: "healthy" }],
      filters: { subjects: [{ subject: "TEST-UA", courseCount: 1 }], catalogTerms: ["Fall"], creditBounds: [0, 4] },
    },
    status: "ready",
  },
  courseData: { courses: [] as CatalogCourseRecord["course"][], customIds: new Set<string>(), programs: [{ id: "cs", name: "Computer Science" }] },
  derived: { placementByCourse: new Map(), placementByCatalogId: new Map(), placementByCustomCourse: new Map() },
}));

vi.mock("@/hooks/useCatalogSearch", () => ({ useCatalogSearch: () => mocks.search }));
vi.mock("@/components/CatalogProvider", () => ({ useCatalog: () => mocks.catalog }));
vi.mock("@/hooks/useCourseData", () => ({ useCourseData: () => mocks.courseData }));
vi.mock("@/hooks/usePlanDerived", () => ({ usePlanDerived: () => mocks.derived }));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 142,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 142 })),
    measureElement: () => undefined,
  }),
}));

function record(): CatalogCourseRecord {
  return {
    stableId: "stern:TEST-UA 1", sourceId: "stern", sourceSnapshotId: "snapshot",
    code: "TEST-UA 1", subject: "TEST-UA", level: "undergraduate",
    catalogOfferingTerms: ["Fall"], catalogOfferingText: "Fall", crossListedStableIds: [],
    course: { id: "TEST-UA 1", title: "New York Seminar", credits: 4, department: "TEST-UA",
      prereqs: [], sourceReferenceIds: [], offered: [], offeringKnown: false, sites: ["newyork"],
      fulfills: [], equivalentTo: [], attributes: [], tags: [] },
  };
}

describe("CourseCatalog", () => {
  beforeEach(() => {
    mocks.search.items = [record()]; mocks.search.status = "ready"; mocks.search.nextCursor = null;
    mocks.search.isStale = false; mocks.search.setQuery.mockClear(); mocks.search.retry.mockClear(); mocks.search.loadMore.mockClear();
    mocks.catalog.status = "ready"; mocks.catalog.bootstrap.sources[0].status = "healthy";
    mocks.courseData.courses = []; mocks.courseData.customIds = new Set();
  });

  it("sends text and all server filter changes to the query state", async () => {
    const user = userEvent.setup();
    render(<CourseCatalog onSelectCourse={() => undefined} onMenuClosed={() => undefined} />);
    await user.type(screen.getByRole("textbox", { name: "Search courses" }), "math");
    expect(mocks.search.setQuery).toHaveBeenLastCalledWith({ q: "h" });
    for (const [label, option] of [["Campus", "New York"], ["School", "NYU Stern"], ["Subject", "TEST-UA"], ["Catalog term", "Fall"], ["Credits", "4 credits"], ["NYUSH fulfillment", "Computer Science"]] as const) {
      await user.click(screen.getByRole("combobox", { name: label }));
      await user.click(await screen.findByRole("option", { name: option }));
    }
    expect(mocks.search.setQuery).toHaveBeenCalledWith({ campuses: ["new-york"] });
    expect(mocks.search.setQuery).toHaveBeenCalledWith({ sourceIds: ["stern"] });
    expect(mocks.search.setQuery).toHaveBeenCalledWith({ subjects: ["TEST-UA"] });
    expect(mocks.search.setQuery).toHaveBeenCalledWith({ catalogTerms: ["Fall"] });
    expect(mocks.search.setQuery).toHaveBeenCalledWith({ minCredits: 4, maxCredits: 4 });
    expect(mocks.search.setQuery).toHaveBeenCalledWith({ fulfillsProgramId: "cs" });
    await user.click(screen.getByRole("button", { name: /Clear filters/ }));
    expect(mocks.search.setQuery).toHaveBeenLastCalledWith(expect.objectContaining({ q: "", campuses: [], sourceIds: [] }));
  });

  it("shows New York trust copy and selects by stable ID", async () => {
    const user = userEvent.setup(); const onSelect = vi.fn();
    render(<CourseCatalog onSelectCourse={onSelect} onMenuClosed={() => undefined} />);
    expect(screen.getByText("New York study-away catalog")).toBeTruthy();
    expect(screen.getByText("Availability and registration eligibility not confirmed")).toBeTruthy();
    expect(screen.getByText(/Bulletin catalog pattern: Fall/)).toBeTruthy();
    await user.click(screen.getByTestId("catalog-stern:TEST-UA 1"));
    expect(onSelect).toHaveBeenCalledWith({ kind: "bulletin", stableId: "stern:TEST-UA 1" });
  });

  it("hands a selected result to an active planning slot", async () => {
    const user = userEvent.setup();
    const onChooseForSlot = vi.fn();
    render(<CourseCatalog onSelectCourse={() => undefined} onMenuClosed={() => undefined} slotSelection={{ query: "Computer Science Elective", slotId: "slot-1", semesterId: "Y3F" }} onChooseForSlot={onChooseForSlot} />);
    expect(mocks.search.setQuery).toHaveBeenCalledWith({ q: "Computer Science Elective" });
    await user.click(screen.getByTestId("catalog-stern:TEST-UA 1"));
    expect(onChooseForSlot).toHaveBeenCalledWith({ courseId: "TEST-UA 1", catalogCourseId: "stern:TEST-UA 1", titleSnapshot: "New York Seminar" });
  });

  it("keeps the assign control outside the interactive draggable card", () => {
    render(<CourseCatalog onSelectCourse={() => undefined} onMenuClosed={() => undefined} />);
    const card = screen.getByTestId("catalog-stern:TEST-UA 1");
    const assign = screen.getByRole("button", { name: "Assign TEST-UA 1 to a semester" });
    expect(card.querySelector("button")).toBeNull();
    expect(card.contains(assign)).toBe(false);
  });

  it("renders loading, empty, retry, offline, and partial-health states", async () => {
    const user = userEvent.setup();
    mocks.search.status = "error"; mocks.search.items = []; mocks.search.isStale = true;
    mocks.catalog.bootstrap.sources[0].status = "stale";
    const view = render(<CourseCatalog onSelectCourse={() => undefined} onMenuClosed={() => undefined} />);
    expect(screen.getByRole("alert").textContent).toContain("temporarily unavailable");
    expect(screen.getByText(/Offline/)).toBeTruthy();
    expect(screen.getByText(/Some Bulletin sources/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.search.retry).toHaveBeenCalledOnce();
    mocks.search.status = "loading"; mocks.search.isStale = false; view.rerender(<CourseCatalog onSelectCourse={() => undefined} onMenuClosed={() => undefined} />);
    expect(screen.getByLabelText("Loading courses")).toBeTruthy();
    mocks.search.status = "empty"; view.rerender(<CourseCatalog onSelectCourse={() => undefined} onMenuClosed={() => undefined} />);
    expect(screen.getByText("No courses match these filters.")).toBeTruthy();
  });

  it("offers accessible manual pagination", async () => {
    const user = userEvent.setup(); mocks.search.nextCursor = "next";
    render(<CourseCatalog onSelectCourse={() => undefined} onMenuClosed={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Load more courses" }));
    expect(mocks.search.loadMore).toHaveBeenCalledOnce();
  });

  it("keeps custom-course filtering local", async () => {
    const user = userEvent.setup();
    const custom = { ...record().course, id: "CUSTOM 1", title: "My Custom" };
    mocks.courseData.courses = [custom];
    mocks.courseData.customIds = new Set([custom.id]);
    render(<CourseCatalog onSelectCourse={() => undefined} onMenuClosed={() => undefined} />);
    await user.click(screen.getByRole("combobox", { name: "Local filter" }));
    await user.click(await screen.findByRole("option", { name: "My custom courses" }));
    expect(screen.getByText("My Custom")).toBeTruthy();
    expect(screen.queryByText("New York Seminar")).toBeNull();
    expect(mocks.search.setQuery).toHaveBeenLastCalledWith({ crossListed: undefined });
  });
});
