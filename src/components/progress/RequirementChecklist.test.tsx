// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequirementChecklist } from "@/components/progress/RequirementChecklist";
import { usePlannerStore } from "@/store/plannerStore";
import { render, screen } from "@/test/render";

const SOURCE_URL = "https://bulletins.nyu.edu/undergraduate/shanghai/programs/data-science-bs/";
const { derived } = vi.hoisted(() => ({ derived: { activeProgramObjs: [] as unknown[], progressByProgram: new Map() } }));
vi.mock("@/hooks/usePlanDerived", () => ({ usePlanDerived: () => derived }));
vi.mock("@/components/CatalogProvider", () => ({ useCatalog: () => ({ bootstrap: { release: { id: "release-1" } } }) }));

const manual = { kind: "manualConfirmation" as const, label: "Director approval", sourceText: "Approval from the program director is required." };
const program = {
  id: "data-science-bs", name: "Data Science", shortName: "DS", type: "major" as const, color: "#57068c",
  categories: [{ id: "probability", name: "Probability", requirement: manual, sourceUrl: SOURCE_URL, sourceTableId: "major-requirements", sourceRowIndexes: [0, 1] }],
  bulletinDisplay: { schemaVersion: 2 as const, sourceUrl: SOURCE_URL, sections: [{ id: "curriculumtext", heading: "Program Requirements", blocks: [{ kind: "table" as const, id: "major-requirements", caption: "Course List", headingTrail: [{ level: 3 as const, text: "Probability" }], rows: [
    { sourceIndex: 0, role: "directive" as const, text: "Select one of the following:", creditsText: "4", linkedCourseCodes: [], sourceAnchors: [], footnoteMarkers: [] },
    { sourceIndex: 1, role: "course" as const, text: "Probability and Statistics", creditsText: null, linkedCourseCodes: ["MATH-SHU 235"], sourceAnchors: [], footnoteMarkers: [] },
  ] }] }] },
  interpretations: [{ id: "probability", name: "Probability", status: "verified" as const, requirement: manual, sourceTableIds: ["major-requirements"], sourceRowRefs: [{ tableId: "major-requirements", sourceIndex: 0 }], diagnostics: [] }],
  requirementRows: [], sourceRows: [], sourceReferenceIds: [],
  provenance: { sourceUrl: SOURCE_URL, snapshotId: "snapshot-1", sourceHash: "hash-1" },
};

describe("RequirementChecklist", () => {
  beforeEach(() => {
    derived.activeProgramObjs = [program];
    derived.progressByProgram = new Map([[program.id, {
      programId: program.id, plannedFraction: 0, completedFraction: 0,
      interpretationStatus: "partial", verifiedCategoryCount: 1, totalInterpretationCount: 2,
      automationCoverage: 0.5, authoritativePlannedFraction: null, authoritativeCompletedFraction: null,
      categories: [{ programId: program.id, categoryId: "probability", name: "Probability", isCapstone: false, requiredUnits: 1, unitKind: "courses", completedUnits: 0, plannedUnits: 0, calculatedCompletedUnits: 0, calculatedPlannedUnits: 0, manualStatus: null, matchedCourseIds: [], missingCourseIds: [], manualState: "pending", gaps: [] }],
    }]]);
    usePlannerStore.setState({ placements: [], completedSemesters: [], fulfillmentFacts: [], programProfile: { coreProgramId: "core", primaryMajorId: program.id, secondMajorId: null, minorIds: [] } });
  });

  it("defaults to the faithful Bulletin and labels incomplete automation without an authoritative percent", async () => {
    const user = userEvent.setup();
    render(<RequirementChecklist />);
    await user.click(screen.getByRole("button", { name: /Data Science/ }));
    expect(screen.getByText("Select one of the following:")).toBeDefined();
    expect(screen.getByText(/MATH-SHU 235.*Probability and Statistics/)).toBeDefined();
    expect(screen.getByText(/verified requirements only/i)).toBeDefined();
    expect(screen.getByText("1 of 2 requirements verified")).toBeDefined();
    expect(screen.queryByText(/^\d+%$/)).toBeNull();
    expect(screen.queryByRole("button", { name: /mark.*fulfilled/i })).toBeNull();
  });

  it("keeps a positively classified verified manual node inside the beta interpretation", async () => {
    const user = userEvent.setup();
    render(<RequirementChecklist />);
    await user.click(screen.getByRole("button", { name: /Data Science/ }));
    await user.click(screen.getByText("Planner interpretation · Beta"));
    await user.click(screen.getByRole("button", { name: "Confirm with evidence" }));
    expect(usePlannerStore.getState().fulfillmentFacts).toEqual([expect.objectContaining({ kind: "manualConfirmation", label: "Director approval" })]);
  });

  it("opens a report for the selected source row", async () => {
    const user = userEvent.setup();
    render(<RequirementChecklist />);
    await user.click(screen.getByRole("button", { name: /Data Science/ }));
    await user.click(screen.getByRole("button", { name: /report.*MATH-SHU 235/i }));
    expect(screen.getByRole("heading", { name: "Report an issue" })).toBeDefined();
    expect(screen.getAllByText(/MATH-SHU 235.*Probability and Statistics/).length).toBeGreaterThan(1);
  });
});
