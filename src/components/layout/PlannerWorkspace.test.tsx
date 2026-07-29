// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { PlannerWorkspace } from "@/components/layout/PlannerWorkspace";
import { render, screen } from "@/test/render";

function setViewport({ lg = false, progressRail = false } = {}) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: query.includes("1792") ? progressRail : lg,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

function renderWorkspace() {
  return render(
    <PlannerWorkspace
      catalog={<div data-testid="catalog-content">Catalog content</div>}
      timeline={<div data-testid="timeline-content">Timeline content</div>}
      progress={<div data-testid="progress-content">Progress content</div>}
    />,
  );
}

describe("PlannerWorkspace", () => {
  beforeEach(() => setViewport());

  it("keeps one timeline and restores trigger focus after closing tool sheets", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    expect(
      screen.getByRole("region", { name: "Four-Year Plan" }),
    ).toBeDefined();
    expect(screen.getAllByTestId("timeline-content")).toHaveLength(1);

    const courses = screen.getByRole("button", { name: "Courses" });
    await user.click(courses);
    expect(
      screen.getByRole("dialog", { name: "Course Catalog" }),
    ).toBeDefined();
    expect(
      screen.getByRole("complementary", { name: "Course Catalog" }),
    ).toBeDefined();
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(courses);

    const progress = screen.getByRole("button", { name: "Progress" });
    await user.click(progress);
    const progressDialog = screen.getByRole("dialog", { name: "Degree Progress" });
    expect(progressDialog).toBeDefined();
    expect(progressDialog.className).toContain("sm:max-w-[52rem]");
    expect(progressDialog.className).toContain("lg:max-w-[60rem]");
    expect(
      screen.getByRole("complementary", { name: "Degree Progress" }),
    ).toBeDefined();
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(progress);
    expect(screen.getAllByTestId("timeline-content")).toHaveLength(1);
  });

  it("shows all three named landmarks as desktop rails", () => {
    setViewport({ lg: true, progressRail: true });
    renderWorkspace();

    expect(
      screen.getByRole("complementary", { name: "Course Catalog" }),
    ).toBeDefined();
    expect(
      screen.getByRole("region", { name: "Four-Year Plan" }),
    ).toBeDefined();
    expect(
      screen.getByRole("complementary", { name: "Degree Progress" }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Courses" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Progress" })).toBeNull();
    expect(screen.getAllByTestId("timeline-content")).toHaveLength(1);
  });

  it("keeps the catalog rail and moves progress into a sheet at lg", () => {
    setViewport({ lg: true, progressRail: false });
    renderWorkspace();

    expect(
      screen.getByRole("complementary", { name: "Course Catalog" }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Courses" })).toBeNull();
    expect(screen.getByRole("button", { name: "Progress" })).toBeDefined();
  });
});
