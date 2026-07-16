// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerHeader } from "@/components/layout/PlannerHeader";
import { usePlannerStore } from "@/store/plannerStore";
import { fireEvent, render, screen, within } from "@/test/render";

vi.mock("@/components/CatalogProvider", async () => {
  const { FIXTURE_PROGRAMS } = await import("@/lib/fixtures.test-helper");
  return {
    useCatalog: () => ({ programs: FIXTURE_PROGRAMS }),
  };
});

vi.mock("@/hooks/usePlanDerived", () => ({
  usePlanDerived: () => ({
    progress: { credits: { planned: 32, goal: 128 } },
  }),
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

describe("PlannerHeader", () => {
  beforeEach(() => {
    usePlannerStore.setState({
      activePrograms: ["core", "a"],
      startYear: 2025,
    });
  });

  it("keeps Guide visible while plan file actions stay in one menu", async () => {
    const user = userEvent.setup();
    const onGuide = vi.fn();
    render(
      <PlannerHeader onGuide={onGuide} onImportFile={() => undefined} />,
    );

    const guide = screen.getByRole("button", { name: "Guide" });
    guide.focus();
    await user.keyboard("{Enter}");
    expect(onGuide).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Plan actions" }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Import plan" }),
    ).toBeDefined();
    expect(
      within(menu).getByRole("menuitem", { name: "Export plan" }),
    ).toBeDefined();
    expect(
      within(menu).getByRole("menuitem", { name: "Reset plan" }),
    ).toBeDefined();
    expect(within(menu).queryByText("Guide")).toBeNull();
  });

  it("exposes the Guide button for dialog focus restoration", () => {
    const guideButtonRef = createRef<HTMLButtonElement>();
    render(
      <PlannerHeader
        guideButtonRef={guideButtonRef}
        onGuide={() => undefined}
        onImportFile={() => undefined}
      />,
    );

    expect(guideButtonRef.current).toBe(
      screen.getByRole("button", { name: "Guide" }),
    );
  });

  it("shows dynamic majors, entry year, credits, theme, and account controls", async () => {
    const user = userEvent.setup();
    render(
      <PlannerHeader onGuide={() => undefined} onImportFile={() => undefined} />,
    );

    expect(screen.getByText("32/128 credits")).toBeDefined();
    expect(screen.getByRole("combobox", { name: "Entry year" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Toggle dark mode" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDefined();

    await user.click(screen.getByRole("combobox", { name: "Degree plan" }));
    expect(screen.getByRole("option", { name: "Major A" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Major B" })).toBeDefined();
  });

  it("passes a selected JSON file to the import handler", () => {
    const onImportFile = vi.fn();
    const { container } = render(
      <PlannerHeader onGuide={() => undefined} onImportFile={onImportFile} />,
    );
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    const file = new File(["{}"], "plan.json", {
      type: "application/json",
    });

    fireEvent.change(input!, { target: { files: [file] } });

    expect(onImportFile).toHaveBeenCalledWith(file);
  });
});
