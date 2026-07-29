// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerBoard } from "@/components/planner/PlannerBoard";
import { mkCourse } from "@/lib/fixtures.test-helper";
import { usePlannerStore } from "@/store/plannerStore";
import { render, screen, within } from "@/test/render";

const { derived } = vi.hoisted(() => ({
  derived: {
    placementsBySemester: new Map(),
    creditsBySemester: new Map(),
    coursesById: new Map(),
    warningsByCourse: new Map(),
    warningsBySemester: new Map(),
    placementByCourse: new Map(),
    effectiveMajors: () => [],
  },
}));

vi.mock("@/hooks/usePlanDerived", () => ({
  usePlanDerived: () => derived,
}));

describe("PlannerBoard", () => {
  beforeEach(() => {
    usePlannerStore.setState({
      placements: [],
      studyAway: {},
      completedSemesters: [],
      startYear: 2025,
    });
    derived.placementsBySemester = new Map();
    derived.creditsBySemester = new Map();
    derived.coursesById = new Map();
    derived.warningsByCourse = new Map();
    derived.warningsBySemester = new Map();
    derived.placementByCourse = new Map();
  });

  it("renders all eight semesters as one chronological column", () => {
    const { container } = render(
      <PlannerBoard onSelectCourse={() => undefined} />,
    );
    const board = container.firstElementChild as HTMLElement;
    const semesterIds = [...board.querySelectorAll('[data-testid^="semester-"]')]
      .map((semester) => semester.getAttribute("data-testid"));

    expect(board.className).toContain("flex-col");
    expect(board.className).not.toMatch(/grid-cols/);
    expect(semesterIds).toEqual([
      "semester-Y1F",
      "semester-Y1S",
      "semester-Y2F",
      "semester-Y2S",
      "semester-Y3F",
      "semester-Y3S",
      "semester-Y4F",
      "semester-Y4S",
    ]);
    expect(screen.getAllByTestId(/^year-/)).toHaveLength(4);
    expect(screen.getAllByText(/^Year [1-4]$/)).toHaveLength(4);
    expect(
      screen.getAllByText(
        "Add courses from the catalog or use Add to semester.",
      ),
    ).toHaveLength(8);
  });

  it("updates the selected credits for a placed variable-credit course", () => {
    usePlannerStore.setState({
      placements: [
        { placementId: "var-1", courseId: "VAR 1", semesterId: "Y1F", allocation: "auto" },
      ],
    });

    usePlannerStore.getState().setSelectedCredits("VAR 1", 2);

    expect(usePlannerStore.getState().placements).toEqual([
      {
        placementId: "var-1",
        courseId: "VAR 1",
        semesterId: "Y1F",
        allocation: "auto",
        selectedCredits: 2,
      },
    ]);
  });

  it("lets a student choose credits for a variable-credit course", async () => {
    const user = userEvent.setup();
    const course = mkCourse({
      id: "VAR 1",
      credits: 4,
      minCredits: 1,
      maxCredits: 4,
    });
    const placement = {
      placementId: "var-1",
      courseId: course.id,
      semesterId: "Y1F" as const,
      allocation: "auto" as const,
      selectedCredits: 2,
    };
    usePlannerStore.setState({ placements: [placement] });
    derived.placementsBySemester = new Map([["Y1F", [placement]]]);
    derived.creditsBySemester = new Map([["Y1F", 2]]);
    derived.coursesById = new Map([[course.id, course]]);
    derived.placementByCourse = new Map([[course.id, placement]]);

    render(<PlannerBoard onSelectCourse={() => undefined} />);

    const chip = screen.getByTestId("chip-var-1");
    const credits = within(chip).getByRole("combobox", {
      name: "Credits for VAR 1",
    });
    expect(credits.textContent).toContain("2 cr");
    await user.click(credits);
    await user.click(await screen.findByRole("option", { name: "3 credits" }));

    expect(usePlannerStore.getState().placements[0].selectedCredits).toBe(3);
    const remove = within(chip).getByRole("button", { name: "Remove VAR 1" });
    expect(remove.className).not.toContain("hidden");
    expect(remove.className).toContain("group-focus-within:opacity-100");
  });

  it("keeps a placement visible when cached catalog detail is unavailable", async () => {
    const user = userEvent.setup();
    const placement = { placementId: "ny-away", catalogCourseId: "stern:NY-UA 1", courseId: "NY-UA 1", titleSnapshot: "Study Away Seminar", semesterId: "Y2F" as const, allocation: "auto" as const };
    usePlannerStore.setState({ placements: [placement] });
    derived.placementsBySemester = new Map([["Y2F", [placement]]]);
    render(<PlannerBoard onSelectCourse={() => undefined} />);
    expect(screen.getByText("Study Away Seminar")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Remove NY-UA 1" }));
    expect(usePlannerStore.getState().placements).toEqual([]);
  });

  it("reports a warning directly from a planned course", async () => {
    const user = userEvent.setup();
    const course = mkCourse({ id: "WARN 1", title: "Warning Seminar" });
    const placement = { placementId: "warn-1", courseId: course.id, semesterId: "Y2S" as const, allocation: "auto" as const };
    const warning = {
      id: "not-offered:WARN 1:Y2S", kind: "not-offered" as const, severity: "warning" as const,
      courseId: course.id, semesterId: "Y2S" as const, message: "WARN 1 is not usually offered in spring.",
    };
    usePlannerStore.setState({ placements: [placement] });
    derived.placementsBySemester = new Map([["Y2S", [placement]]]);
    derived.coursesById = new Map([[course.id, course]]);
    derived.warningsByCourse = new Map([[course.id, [warning]]]);

    render(<PlannerBoard onSelectCourse={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Warnings for WARN 1" }));
    await user.click(await screen.findByRole("menuitem", { name: /Report.*WARN 1 is not usually offered/ }));

    expect(screen.getByRole("heading", { name: "Report an issue" })).toBeDefined();
    expect(screen.getByText("Planning warning · WARN 1")).toBeDefined();
  });

  it("reports a semester-level warning directly from the plan", async () => {
    const user = userEvent.setup();
    derived.warningsBySemester = new Map([["Y2S", [{
      id: "underload:Y2S", kind: "underload" as const, severity: "warning" as const,
      semesterId: "Y2S" as const, message: "Spring 2027 is below the full-time minimum.",
    }]]]);

    render(<PlannerBoard onSelectCourse={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Warnings for Spring 2027" }));
    await user.click(await screen.findByRole("menuitem", { name: /Report.*below the full-time minimum/ }));

    expect(screen.getByRole("heading", { name: "Report an issue" })).toBeDefined();
    expect(screen.getByText("Planning warning · Spring 2027")).toBeDefined();
  });
});
