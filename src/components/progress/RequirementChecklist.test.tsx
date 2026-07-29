// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequirementChecklist } from "@/components/progress/RequirementChecklist";
import { mkCourse } from "@/lib/fixtures.test-helper";
import { usePlannerStore } from "@/store/plannerStore";
import { render, screen, within } from "@/test/render";

const SOURCE_URL = "https://bulletins.nyu.edu/undergraduate/shanghai/programs/humanities/";
const POLICY_TEXT = "Approval from the program director is required.";

const { derived } = vi.hoisted(() => ({
  derived: {
    activeProgramObjs: [] as unknown[],
    progressByProgram: new Map(),
    placementByCourse: new Map(),
    coursesById: new Map(),
  },
}));

vi.mock("@/hooks/usePlanDerived", () => ({ usePlanDerived: () => derived }));

const requirement = {
  kind: "all" as const,
  children: [
    { kind: "course" as const, courseId: "HUMA-SHU 100" },
    { kind: "waiver" as const, waiverId: "language-placement", label: "Language placement" },
    { kind: "manualConfirmation" as const, label: "Director approval", sourceText: POLICY_TEXT },
  ],
};

const program = {
  id: "humanities",
  name: "Humanities",
  shortName: "HUM",
  type: "major" as const,
  color: "#7c3aed",
  categories: [{
    id: "foundations",
    name: "Foundations",
    requirement,
    sourceUrl: SOURCE_URL,
    sourceTableId: "program-requirements",
    sourceRowIndexes: [0, 1, 2],
  }],
  requirementRows: [
    {
      sourceUrl: SOURCE_URL, tableId: "program-requirements", sourceIndex: 1,
      sourceText: "Language placement may waive this requirement.", categoryId: "foundations",
      nodePath: [1], node: requirement.children[1],
    },
    {
      sourceUrl: SOURCE_URL, tableId: "program-requirements", sourceIndex: 2,
      sourceText: POLICY_TEXT, categoryId: "foundations", nodePath: [2], node: requirement.children[2],
    },
  ],
  sourceRows: [],
  sourceReferenceIds: [],
  provenance: { sourceUrl: SOURCE_URL, snapshotId: "snapshot-1", sourceHash: "hash-1" },
};

const course = mkCourse({ id: "HUMA-SHU 100", title: "Memory and Modernity", department: "Humanities" });

describe("RequirementChecklist", () => {
  beforeEach(() => {
    derived.activeProgramObjs = [program];
    derived.progressByProgram = new Map([["humanities", {
      programId: "humanities",
      plannedFraction: 1 / 3,
      completedFraction: 0,
      categories: [{
        programId: "humanities",
        categoryId: "foundations",
        name: "Foundations",
        isCapstone: false,
        requiredUnits: 3,
        unitKind: "courses",
        completedUnits: 0,
        plannedUnits: 1,
        calculatedCompletedUnits: 0,
        calculatedPlannedUnits: 1,
        manualStatus: null,
        matchedCourseIds: [course.id],
        missingCourseIds: [],
        manualState: "pending",
        gaps: [
          { kind: "waiver", label: "Language placement", waiverId: "language-placement" },
          { kind: "manual", label: "Director approval", sourceText: POLICY_TEXT },
        ],
      }],
    }]]);
    derived.placementByCourse = new Map([[course.id, { courseId: course.id, semesterId: "Y1F", allocation: "auto" }]]);
    derived.coursesById = new Map([[course.id, course]]);
    usePlannerStore.setState({
      placements: [{ placementId: "manual-1", courseId: course.id, semesterId: "Y1F", allocation: "auto" }],
      completedSemesters: [], fulfillmentFacts: [], requirementStatusOverrides: [], startYear: 2025,
    });
  });

  it("shows compact Bulletin evidence with course code and title", async () => {
    const user = userEvent.setup();
    render(<RequirementChecklist />);
    await user.click(screen.getByRole("button", { name: /Humanities/ }));

    expect(screen.getByText(/0 earned.*1 planned \/ 3/)).toBeDefined();
    expect(screen.getByText("Needs confirmation")).toBeDefined();
    expect(screen.getByText(POLICY_TEXT)).toBeDefined();
    expect(screen.getByText("Waiver available")).toBeDefined();
    expect(screen.getByRole("link", { name: "View requirement in NYU Bulletin" }).getAttribute("href")).toBe(SOURCE_URL);
    expect(screen.getByText(course.id)).toBeDefined();
    expect(screen.getByText(course.title)).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Report requirement issue" }));
    expect(screen.getByRole("heading", { name: "Report an issue" })).toBeDefined();
  });

  it("marks and removes manual evidence without changing planned courses", async () => {
    const user = userEvent.setup();
    render(<RequirementChecklist />);
    await user.click(screen.getByRole("button", { name: /Humanities/ }));
    const originalPlacements = usePlannerStore.getState().placements;

    await user.click(screen.getByRole("button", { name: "Mark as fulfilled" }));
    expect(usePlannerStore.getState().fulfillmentFacts).toEqual([
      expect.objectContaining({ kind: "manualConfirmation", requirementId: POLICY_TEXT, label: "Director approval" }),
    ]);
    expect(usePlannerStore.getState().placements).toEqual(originalPlacements);
    expect(within(screen.getByTestId("manual-requirement")).getByRole("button", { name: "Remove manual mark" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Remove manual mark" }));
    expect(usePlannerStore.getState().fulfillmentFacts).toEqual([]);
  });

  it("records and removes an explicit waiver fact", async () => {
    const user = userEvent.setup();
    render(<RequirementChecklist />);
    await user.click(screen.getByRole("button", { name: /Humanities/ }));
    await user.click(screen.getByRole("button", { name: "Record waiver" }));
    expect(usePlannerStore.getState().fulfillmentFacts).toEqual([
      expect.objectContaining({ kind: "waiver", requirementId: "language-placement" }),
    ]);
    await user.click(screen.getByRole("button", { name: "Remove waiver" }));
    expect(usePlannerStore.getState().fulfillmentFacts).toEqual([]);
  });

  it("marks a whole requirement as planned", async () => {
    const user = userEvent.setup();
    render(<RequirementChecklist />);
    await user.click(screen.getByRole("button", { name: /Humanities/ }));
    const category = screen.getByTestId("requirement-category-humanities-foundations");

    await user.click(within(category).getByRole("button", { name: "Set requirement status" }));
    await user.click(screen.getByRole("menuitem", { name: "Mark as planned" }));
    expect(usePlannerStore.getState().requirementStatusOverrides).toEqual([
      { programId: "humanities", categoryId: "foundations", status: "planned" },
    ]);
    expect(within(category).getByText("Planned manually")).toBeDefined();
  });

  it("changes a planned requirement to fulfilled", async () => {
    usePlannerStore.setState({
      requirementStatusOverrides: [{ programId: "humanities", categoryId: "foundations", status: "planned" }],
    });
    const user = userEvent.setup();
    render(<RequirementChecklist />);
    await user.click(screen.getByRole("button", { name: /Humanities/ }));
    const category = screen.getByTestId("requirement-category-humanities-foundations");

    await user.click(within(category).getByRole("button", { name: "Change requirement status" }));
    await user.click(await screen.findByRole("menuitem", { name: "Mark as fulfilled" }));
    expect(usePlannerStore.getState().requirementStatusOverrides[0].status).toBe("completed");
    expect(within(category).getByText("Fulfilled manually")).toBeDefined();
  });

  it("returns a manual requirement to its calculated status", async () => {
    usePlannerStore.setState({
      requirementStatusOverrides: [{ programId: "humanities", categoryId: "foundations", status: "completed" }],
    });
    const user = userEvent.setup();
    render(<RequirementChecklist />);
    await user.click(screen.getByRole("button", { name: /Humanities/ }));
    const category = screen.getByTestId("requirement-category-humanities-foundations");

    await user.click(within(category).getByRole("button", { name: "Change requirement status" }));
    await user.click(await screen.findByRole("menuitem", { name: "Use calculated status" }));
    expect(usePlannerStore.getState().requirementStatusOverrides).toEqual([]);
  });
});
