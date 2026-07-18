// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequirementChecklist } from "@/components/progress/RequirementChecklist";
import { FeasibilityDialog } from "@/components/progress/FeasibilityDialog";
import { mkCourse } from "@/lib/fixtures.test-helper";
import type { FeasibilityReport } from "@/lib/feasibility";
import { usePlannerStore } from "@/store/plannerStore";
import { render, screen, within } from "@/test/render";

const SOURCE_URL =
  "https://bulletins.nyu.edu/undergraduate/shanghai/programs/humanities/";
const POLICY_TEXT = "Approval from the program director is required.";

const { derived } = vi.hoisted(() => ({
  derived: {
    activeProgramObjs: [] as unknown[],
    progressByProgram: new Map(),
    placementByCourse: new Map(),
    coursesById: new Map(),
    feasibility: {
      status: "infeasible",
      suggestion: [],
      overloadedTerms: [],
      unplaceable: [],
      requirementGaps: [],
      remaining: { courses: 0, credits: 0 },
    } as FeasibilityReport,
  },
}));

vi.mock("@/hooks/usePlanDerived", () => ({
  usePlanDerived: () => derived,
  useFeasibility: () => derived.feasibility,
}));

const requirement = {
  kind: "all" as const,
  children: [
    { kind: "course" as const, courseId: "HUMA-SHU 100" },
    { kind: "waiver" as const, waiverId: "language-placement", label: "Language placement" },
    {
      kind: "manualConfirmation" as const,
      label: "Director approval",
      sourceText: POLICY_TEXT,
    },
  ],
};

const program = {
  id: "humanities",
  name: "Humanities",
  shortName: "HUM",
  type: "major" as const,
  color: "#7c3aed",
  categories: [
    {
      id: "foundations",
      name: "Foundations",
      requirement,
      sourceUrl: SOURCE_URL,
      sourceTableId: "program-requirements",
      sourceRowIndexes: [0, 1, 2],
    },
  ],
  requirementRows: [
    {
      sourceUrl: SOURCE_URL,
      tableId: "program-requirements",
      sourceIndex: 1,
      sourceText: "Language placement may waive this requirement.",
      categoryId: "foundations",
      nodePath: [1],
      node: requirement.children[1],
    },
    {
      sourceUrl: SOURCE_URL,
      tableId: "program-requirements",
      sourceIndex: 2,
      sourceText: POLICY_TEXT,
      categoryId: "foundations",
      nodePath: [2],
      node: requirement.children[2],
    },
  ],
  sourceRows: [],
  sourceReferenceIds: [],
  provenance: {
    sourceUrl: SOURCE_URL,
    snapshotId: "snapshot-1",
    sourceHash: "hash-1",
  },
};

const course = mkCourse({
  id: "HUMA-SHU 100",
  title: "Memory and Modernity",
  department: "Humanities",
});

describe("RequirementChecklist", () => {
  beforeEach(() => {
    derived.activeProgramObjs = [program];
    derived.progressByProgram = new Map([
      [
        "humanities",
        {
          programId: "humanities",
          plannedFraction: 1 / 3,
          completedFraction: 0,
          categories: [
            {
              programId: "humanities",
              categoryId: "foundations",
              name: "Foundations",
              isCapstone: false,
              requiredUnits: 3,
              unitKind: "courses",
              completedUnits: 0,
              plannedUnits: 1,
              matchedCourseIds: [course.id],
              missingCourseIds: [],
              manualState: "pending",
              gaps: [
                {
                  kind: "waiver",
                  label: "Language placement",
                  waiverId: "language-placement",
                },
                {
                  kind: "manual",
                  label: "Director approval",
                  sourceText: POLICY_TEXT,
                },
              ],
            },
          ],
        },
      ],
    ]);
    derived.placementByCourse = new Map([
      [course.id, { courseId: course.id, semesterId: "Y1F", allocation: "auto" }],
    ]);
    derived.coursesById = new Map([[course.id, course]]);
    derived.feasibility = {
      status: "infeasible",
      suggestion: [],
      overloadedTerms: [],
      unplaceable: [],
      requirementGaps: [
        {
          kind: "manual",
          label: "Director approval",
          sourceText: POLICY_TEXT,
        },
        {
          kind: "waiver",
          label: "Language placement",
          waiverId: "language-placement",
        },
      ],
      remaining: { courses: 0, credits: 0 },
    };
    usePlannerStore.setState({
      placements: [
        { placementId: "manual-1", courseId: course.id, semesterId: "Y1F", allocation: "auto" },
      ],
      completedSemesters: [],
      fulfillmentFacts: [],
      startYear: 2025,
    });
  });

  it("frames feasibility as a greedy check and explains non-course gaps", async () => {
    const user = userEvent.setup();
    render(<FeasibilityDialog />);

    await user.click(screen.getByRole("button", { name: "Check feasibility" }));

    expect(
      screen.getByText(
        "This is a greedy planning check, not proof that no valid schedule exists.",
      ),
    ).toBeDefined();
    expect(screen.getByRole("heading", { name: "Advisor or policy follow-up" })).toBeDefined();
    expect(screen.getByText(POLICY_TEXT)).toBeDefined();
    expect(screen.getByText("Language placement")).toBeDefined();
  });

  it("explains automatic and non-course requirements from the Bulletin", async () => {
    const user = userEvent.setup();
    render(<RequirementChecklist />);

    await user.click(screen.getByRole("button", { name: /Humanities/ }));

    expect(screen.getByText("0 earned · 1 planned / 3")).toBeDefined();
    expect(screen.getByText("Confirmation required")).toBeDefined();
    expect(screen.getByText(POLICY_TEXT)).toBeDefined();
    expect(screen.getByText("Waiver available")).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "View requirement in NYU Bulletin" })
        .getAttribute("href"),
    ).toBe(SOURCE_URL);
    expect(screen.getByText(course.id)).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Report requirement issue" }));
    expect(screen.getByRole("heading", { name: "Report an issue" })).toBeDefined();
    expect(screen.getByText("Humanities · Foundations")).toBeDefined();
  });

  it("records and removes manual evidence without changing planned courses", async () => {
    const user = userEvent.setup();
    render(<RequirementChecklist />);
    await user.click(screen.getByRole("button", { name: /Humanities/ }));
    const originalPlacements = usePlannerStore.getState().placements;

    await user.click(screen.getByRole("button", { name: "Record confirmation" }));

    expect(usePlannerStore.getState().fulfillmentFacts).toEqual([
      expect.objectContaining({
        kind: "manualConfirmation",
        requirementId: POLICY_TEXT,
        label: "Director approval",
      }),
    ]);
    expect(usePlannerStore.getState().placements).toEqual(originalPlacements);
    expect(
      within(screen.getByTestId("manual-requirement")).getByRole("button", {
        name: "Remove confirmation",
      }),
    ).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Remove confirmation" }));
    expect(usePlannerStore.getState().fulfillmentFacts).toEqual([]);
  });

  it("records and removes an explicit waiver fact", async () => {
    const user = userEvent.setup();
    render(<RequirementChecklist />);
    await user.click(screen.getByRole("button", { name: /Humanities/ }));

    await user.click(screen.getByRole("button", { name: "Record waiver" }));
    expect(usePlannerStore.getState().fulfillmentFacts).toEqual([
      expect.objectContaining({
        kind: "waiver",
        requirementId: "language-placement",
      }),
    ]);

    await user.click(screen.getByRole("button", { name: "Remove waiver" }));
    expect(usePlannerStore.getState().fulfillmentFacts).toEqual([]);
  });
});
