// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourseDetailDialog } from "@/components/dialogs/CourseDetailDialog";
import type { CatalogClient } from "@/lib/catalogClient";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import { usePlannerStore } from "@/store/plannerStore";

const state = vi.hoisted(() => ({
  records: new Map<string, CatalogCourseRecord>(),
  ensureCourses: vi.fn(async () => undefined),
  pinCourses: vi.fn(),
  upsertRecords: vi.fn((records: CatalogCourseRecord[]) => records.forEach((record) => state.records.set(record.stableId, record))),
}));

vi.mock("@/components/CatalogProvider", () => ({
  useCatalog: () => ({
    getRecord: (id: string) => state.records.get(id),
    ensureCourses: state.ensureCourses,
    pinCourses: state.pinCourses,
    upsertRecords: state.upsertRecords,
    bootstrap: {
      release: { id: "release-2026", publishedAt: "2026-07-18T00:00:00.000Z" },
      sources: [{ id: "stern", schoolName: "NYU Stern", campus: "new-york" }],
    },
    programsById: new Map(),
  }),
}));
vi.mock("@/hooks/useCourseData", () => ({
  useCourseData: () => ({ coursesById: new Map(), customIds: new Set() }),
}));
vi.mock("@/hooks/usePlanDerived", () => ({
  usePlanDerived: () => ({ placementByCourse: new Map() }),
}));

function record(): CatalogCourseRecord {
  return {
    stableId: "stern:TEST-UA 1", sourceId: "stern", sourceSnapshotId: "snapshot",
    code: "TEST-UA 1", subject: "TEST-UA", level: "undergraduate",
    catalogOfferingTerms: ["Fall"], catalogOfferingText: "Fall", crossListedStableIds: [],
    course: {
      id: "TEST-UA 1", title: "New York Seminar", credits: 4, department: "TEST-UA",
      description: "A Bulletin course.", prereqs: [["stern:PRE-UA 1", "PRE-UA 2"]],
      prerequisiteText: "PRE-UA 1 or PRE-UA 2", sourceReferenceIds: [], offered: [],
      offeringKnown: false, sites: ["newyork"], fulfills: [], equivalentTo: [], attributes: [], tags: [],
      provenance: { sourceUrl: "https://bulletins.nyu.edu/undergraduate/business/courses/test-ua/", snapshotId: "snapshot", sourceHash: "hash" },
    },
  };
}

function client(getCourse: CatalogClient["getCourse"]): CatalogClient {
  return { getBootstrap: vi.fn(), search: vi.fn(), getCourse, getCourses: vi.fn() };
}

describe("CourseDetailDialog", () => {
  beforeEach(() => {
    state.records.clear(); state.ensureCourses.mockClear(); state.pinCourses.mockClear(); state.upsertRecords.mockClear();
    usePlannerStore.setState({ placements: [], customCourses: [] });
  });

  it("hydrates once, reuses cache, batches known stable prerequisites, and renders trust signals", async () => {
    const getCourse = vi.fn(async () => record());
    const api = client(getCourse);
    const view = render(<CourseDetailDialog stableId="stern:TEST-UA 1" onClose={() => undefined} client={api} />);
    await screen.findByRole("heading", { name: /New York Seminar/ });
    expect(getCourse).toHaveBeenCalledOnce();
    expect(state.ensureCourses).toHaveBeenCalledWith(["stern:PRE-UA 1"]);
    expect(screen.getByText(/NYU Stern · New York/)).toBeTruthy();
    expect(screen.getByText(/NYU Bulletin catalog · 2026/)).toBeTruthy();
    expect(screen.getByText(/Availability and registration eligibility are not confirmed/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open official Bulletin/ }).getAttribute("href")).toContain("bulletins.nyu.edu");
    expect(screen.getByText(/Not currently mapped to an NYUSH requirement/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Report catalog issue" }).getAttribute("data-correction-entry")).toBe("stern:TEST-UA 1");
    view.rerender(<CourseDetailDialog stableId={null} onClose={() => undefined} client={api} />);
    view.rerender(<CourseDetailDialog stableId="stern:TEST-UA 1" onClose={() => undefined} client={api} />);
    await screen.findByRole("heading", { name: /New York Seminar/ });
    expect(getCourse).toHaveBeenCalledOnce();
  });

  it("aborts in-flight detail work when closed", async () => {
    let signal: AbortSignal | undefined;
    const api = client(vi.fn((_id, nextSignal) => {
      signal = nextSignal;
      return new Promise<CatalogCourseRecord>(() => undefined);
    }));
    const view = render(<CourseDetailDialog stableId="stern:TEST-UA 1" onClose={() => undefined} client={api} />);
    await waitFor(() => expect(signal).toBeDefined());
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("shows a recoverable missing-record state", async () => {
    const api = client(vi.fn(async () => { throw new Error("missing"); }));
    render(<CourseDetailDialog stableId="stern:missing" onClose={() => undefined} client={api} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
