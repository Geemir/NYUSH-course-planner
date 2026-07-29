// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerHeader } from "@/components/layout/PlannerHeader";
import { usePlannerStore } from "@/store/plannerStore";
import { fireEvent, render, screen, waitFor, within } from "@/test/render";

const exportMocks = vi.hoisted(() => ({
  renderPlanExcel: vi.fn(async () => new Uint8Array([1, 2, 3])),
  renderPlanPdf: vi.fn(async () => new Uint8Array([4, 5, 6])),
  downloadBytes: vi.fn(),
}));

vi.mock("@/lib/planExport/excel", () => ({ renderPlanExcel: exportMocks.renderPlanExcel }));
vi.mock("@/lib/planExport/pdf", () => ({ renderPlanPdf: exportMocks.renderPlanPdf }));
vi.mock("@/lib/planExport/download", () => ({ downloadBytes: exportMocks.downloadBytes }));
vi.mock("@/lib/planExport/model", () => ({
  buildPlanExportModel: vi.fn(() => ({ startYear: 2025 })),
  planExportFilename: vi.fn((_model, extension: string) => `nyush-degree-plan-2025.${extension}`),
}));

vi.mock("@/components/CatalogProvider", async () => {
  const { FIXTURE_PROGRAMS } = await import("@/lib/fixtures.test-helper");
  return {
    useCatalog: () => ({
      programs: FIXTURE_PROGRAMS,
      bootstrap: { release: { id: "release-1" } },
    }),
  };
});

vi.mock("@/hooks/usePlanDerived", () => ({
  usePlanDerived: () => ({
    progress: { credits: { planned: 32, goal: 128 } },
    placementsBySemester: new Map(),
    creditsBySemester: new Map(),
    coursesById: new Map(),
    activeProgramObjs: [],
    allocation: { effective: new Map() },
    warnings: [],
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
    vi.clearAllMocks();
    usePlannerStore.setState({
      activePrograms: ["core", "a"],
      programProfile: { coreProgramId: "core", primaryMajorId: "a", secondMajorId: null, minorIds: [] },
      startYear: 2025,
    });
  });

  it("builds and downloads an Excel workbook from the flat actions menu", async () => {
    const user = userEvent.setup();
    render(<PlannerHeader onGuide={() => undefined} onImportFile={() => undefined} />);

    await user.click(screen.getByRole("button", { name: "Plan actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Export Excel workbook" }));

    await waitFor(() => expect(exportMocks.renderPlanExcel).toHaveBeenCalledOnce());
    expect(exportMocks.downloadBytes).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "nyush-degree-plan-2025.xlsx",
    );
  });

  it("ignores a rapid duplicate readable-export action", async () => {
    const user = userEvent.setup();
    let resolveWorkbook: (bytes: Uint8Array<ArrayBuffer>) => void = () => undefined;
    exportMocks.renderPlanExcel.mockReturnValueOnce(
      new Promise<Uint8Array<ArrayBuffer>>((resolve) => { resolveWorkbook = resolve; }),
    );
    render(<PlannerHeader onGuide={() => undefined} onImportFile={() => undefined} />);

    await user.click(screen.getByRole("button", { name: "Plan actions" }));
    const item = await screen.findByRole("menuitem", { name: "Export Excel workbook" });
    fireEvent.click(item);
    fireEvent.click(item);

    await waitFor(() => expect(exportMocks.renderPlanExcel).toHaveBeenCalledOnce());
    resolveWorkbook(new Uint8Array([1, 2, 3]));
    await waitFor(() => expect(exportMocks.downloadBytes).toHaveBeenCalledOnce());
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
      within(menu).getByRole("menuitem", { name: "Export JSON backup" }),
    ).toBeDefined();
    expect(
      within(menu).getByRole("menuitem", { name: "Export Excel workbook" }),
    ).toBeDefined();
    expect(
      within(menu).getByRole("menuitem", { name: "Export PDF report" }),
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

  it("offers reporting and report history from Help", async () => {
    const user = userEvent.setup();
    render(<PlannerHeader onGuide={() => undefined} onImportFile={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Help" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Report another issue" })).toBeDefined();
    expect(within(menu).getByRole("menuitem", { name: "My reports" })).toBeDefined();
  });

  it("shows Program Profile, entry year, credits, theme, and account controls", () => {
    render(
      <PlannerHeader onGuide={() => undefined} onImportFile={() => undefined} />,
    );

    expect(screen.getByText("32/128 credits")).toBeDefined();
    expect(screen.getByRole("button", { name: "Edit Program Profile" })).toBeDefined();
    expect(screen.getByRole("combobox", { name: "Entry year" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Toggle dark mode" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDefined();
  });

  it("orders the NYU Violets logo, language, then navigation and account controls", () => {
    const { container } = render(<PlannerHeader onGuide={() => undefined} onImportFile={() => undefined} />);
    const ordered = container.querySelector("[data-header-order]");
    expect([...ordered!.children].map((child) => child.getAttribute("data-header-part"))).toEqual(["logo", "language", "controls"]);
    expect(screen.getByRole("img", { name: "NYU Violets" })).toBeDefined();
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
