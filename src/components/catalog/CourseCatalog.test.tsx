// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourseCatalog } from "@/components/catalog/CourseCatalog";
import { mkCourse } from "@/lib/fixtures.test-helper";
import { usePlannerStore } from "@/store/plannerStore";
import { render, screen, waitFor, within } from "@/test/render";

const { catalog, derived, virtualWindow } = vi.hoisted(() => ({
  catalog: {
    courses: [] as ReturnType<typeof mkCourse>[],
    programs: [] as Array<{
      id: string;
      name: string;
      shortName: string;
      type: "major";
      color: string;
      categories: Array<{
        id: string;
        name: string;
        isCapstone: boolean;
        rule: { kind: "allOf"; courses: string[] };
      }>;
    }>,
    customIds: new Set<string>(),
    coursesById: new Map(),
  },
  derived: { placementByCourse: new Map() },
  virtualWindow: { limit: Number.POSITIVE_INFINITY },
}));

vi.mock("@/hooks/useCourseData", () => ({
  useCourseData: () => catalog,
}));

vi.mock("@/hooks/usePlanDerived", () => ({
  usePlanDerived: () => derived,
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => {
    const visibleCount = Math.min(count, virtualWindow.limit);
    return {
      getTotalSize: () => count * 96,
      getVirtualItems: () =>
        Array.from({ length: visibleCount }, (_, index) => ({
          index,
          key: index,
          start: index * 96,
          size: 88,
          end: index * 96 + 88,
          lane: 0,
        })),
      measureElement: () => undefined,
    };
  },
}));

const humanities = {
  id: "humanities",
  name: "Humanities",
  shortName: "HUM",
  type: "major" as const,
  color: "#7c3aed",
  categories: [
    {
      id: "humanities-foundations",
      name: "Foundations",
      isCapstone: false,
      rule: { kind: "allOf" as const, courses: ["HUMA-SHU 100"] },
    },
  ],
};

const courses = [
  mkCourse({
    id: "HUMA-SHU 100",
    title: "Memory and Modernity",
    department: "Humanities",
    description: "An introduction to archives and cultural memory.",
    offered: ["spring"],
    fulfills: [
      { programId: "humanities", categoryId: "humanities-foundations" },
    ],
  }),
  mkCourse({
    id: "HIST-SHU 200",
    title: "Global History",
    department: "History",
    attributes: ["Core"],
    offered: ["fall"],
  }),
  mkCourse({
    id: "HIST-SHU 201",
    title: "Oceans in History",
    department: "History",
    description: "Maritime networks across Asia.",
    attributes: ["Global"],
    offered: ["spring"],
  }),
  mkCourse({
    id: "UNKN-SHU 1",
    title: "Topics with Variable Schedule",
    department: "History",
    offered: [],
    offeringKnown: false,
  }),
  mkCourse({
    id: "PLAN-SHU 1",
    title: "Planned Seminar",
    department: "Social Science",
    offered: ["spring"],
  }),
  mkCourse({
    id: "CUST-SHU 1",
    title: "My Custom Course",
    department: "Independent Study",
    offered: ["spring"],
  }),
];

async function chooseFilter(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  const trigger = screen.getByRole("combobox", { name: "Filter courses" });
  await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("false"));
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: label }));
}

describe("CourseCatalog", () => {
  beforeEach(() => {
    catalog.courses = courses;
    catalog.programs = [humanities];
    catalog.customIds = new Set(["CUST-SHU 1"]);
    catalog.coursesById = new Map(courses.map((course) => [course.id, course]));
    derived.placementByCourse = new Map([
      [
        "PLAN-SHU 1",
        { courseId: "PLAN-SHU 1", semesterId: "Y1F", allocation: "auto" },
      ],
    ]);
    virtualWindow.limit = Number.POSITIVE_INFINITY;
    usePlannerStore.setState({
      activePrograms: ["humanities"],
      placements: [
        { courseId: "PLAN-SHU 1", semesterId: "Y1F", allocation: "auto" },
      ],
      startYear: 2025,
    });
  });

  it("searches descriptions and subjects and filters a runtime program", async () => {
    const user = userEvent.setup();
    render(
      <CourseCatalog
        onSelectCourse={() => undefined}
        onMenuClosed={() => undefined}
      />,
    );
    const search = screen.getByRole("textbox", { name: "Search courses" });

    await user.type(search, "archives");
    expect(screen.getByText("1 of 6 courses")).toBeDefined();
    expect(screen.getByTestId("catalog-HUMA-SHU 100")).toBeDefined();

    await user.clear(search);
    await user.type(search, "History");
    expect(screen.getByText("3 of 6 courses")).toBeDefined();

    await user.clear(search);
    await chooseFilter(user, "Humanities program");
    expect(screen.getByText("1 of 6 courses")).toBeDefined();
    expect(screen.getByTestId("catalog-HUMA-SHU 100")).toBeDefined();
  });

  it("filters dynamic attributes and known or unknown terms", async () => {
    const user = userEvent.setup();
    render(
      <CourseCatalog
        onSelectCourse={() => undefined}
        onMenuClosed={() => undefined}
      />,
    );

    await chooseFilter(user, "Core");
    expect(screen.getByText("1 of 6 courses")).toBeDefined();
    expect(screen.getByTestId("catalog-HIST-SHU 200")).toBeDefined();

    await chooseFilter(user, "Fall");
    expect(screen.getByText("1 of 6 courses")).toBeDefined();
    expect(screen.queryByTestId("catalog-UNKN-SHU 1")).toBeNull();

    await chooseFilter(user, "Schedule varies");
    expect(screen.getByText("1 of 6 courses")).toBeDefined();
    expect(
      within(screen.getByTestId("catalog-UNKN-SHU 1")).getByText(
        "Schedule varies",
      ),
    ).toBeDefined();
  });

  it("filters courses that are not in the plan", async () => {
    const user = userEvent.setup();
    render(
      <CourseCatalog
        onSelectCourse={() => undefined}
        onMenuClosed={() => undefined}
      />,
    );

    await chooseFilter(user, "Not planned yet");
    expect(screen.getByText("5 of 6 courses")).toBeDefined();
    expect(screen.queryByTestId("catalog-PLAN-SHU 1")).toBeNull();
  });

  it("renders only the virtual window while reporting the full result count", () => {
    virtualWindow.limit = 2;
    render(
      <CourseCatalog
        onSelectCourse={() => undefined}
        onMenuClosed={() => undefined}
      />,
    );

    expect(screen.getByText("6 of 6 courses")).toBeDefined();
    expect(screen.getAllByTestId(/^catalog-/)).toHaveLength(2);
  });

  it("presents Albert parsing as an optional custom-course helper", async () => {
    const user = userEvent.setup();
    render(
      <CourseCatalog
        onSelectCourse={() => undefined}
        onMenuClosed={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add custom course" }));
    expect(
      screen.getByRole("heading", { name: "Add a custom course" }),
    ).toBeDefined();
    expect(screen.getByText(/Official courses come from the NYU Bulletin/)).toBeDefined();
  });
});
