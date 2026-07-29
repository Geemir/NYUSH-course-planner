// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import type { ReactNode, RefObject } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerApp } from "@/components/PlannerApp";
import { ONBOARDING_KEY } from "@/lib/onboarding";
import { renderWithProviders, screen, waitFor } from "@/test/render";

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: ReactNode }) => children,
  DragOverlay: ({ children }: { children: ReactNode }) => children,
  PointerSensor: function PointerSensor() {},
  pointerWithin: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock("@/components/CatalogProvider", () => ({
  CatalogProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/PlanSync", () => ({ PlanSync: () => null }));
vi.mock("@/components/planner/PlanDerivedProvider", () => ({
  PlanDerivedProvider: ({ children }: { children: ReactNode }) =>
    children,
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

vi.mock("@/components/layout/PlannerHeader", () => ({
  PlannerHeader: ({
    onGuide,
    guideButtonRef,
  }: {
    onGuide: () => void;
    guideButtonRef?: RefObject<HTMLButtonElement | null>;
  }) => (
    <header>
      <button ref={guideButtonRef} type="button" onClick={onGuide}>
        Guide
      </button>
    </header>
  ),
}));

vi.mock("@/components/inspiration/InspirationStrip", () => ({
  InspirationStrip: () => <section data-testid="inspiration">Inspiration</section>,
}));
vi.mock("@/components/announcements/AnnouncementBanner", () => ({
  AnnouncementBanner: () => <section data-testid="announcement">Announcement</section>,
}));

vi.mock("@/components/layout/PlannerWorkspace", () => ({
  PlannerWorkspace: ({
    catalog,
    timeline,
    progress,
  }: {
    catalog: ReactNode;
    timeline: ReactNode;
    progress: ReactNode;
  }) => (
    <main data-testid="workspace">
      {catalog}
      {timeline}
      {progress}
    </main>
  ),
}));

vi.mock("@/components/catalog/CourseCatalog", () => ({
  CourseCatalog: () => <div>Catalog</div>,
}));
vi.mock("@/components/planner/PlannerBoard", () => ({
  PlannerBoard: () => (
    <div>
      {Array.from({ length: 8 }, (_, index) => (
        <section key={index} data-testid={`semester-${index + 1}`} />
      ))}
    </div>
  ),
}));
vi.mock("@/components/dialogs/CourseDetailDialog", () => ({
  CourseDetailDialog: () => null,
}));
vi.mock("@/components/progress/FeasibilityDialog", () => ({
  FeasibilityDialog: () => null,
}));
vi.mock("@/components/progress/ProgressRings", () => ({
  ProgressRings: () => null,
}));
vi.mock("@/components/progress/RequirementChecklist", () => ({
  RequirementChecklist: () => null,
}));
vi.mock("@/components/progress/SpecialRulesPanel", () => ({
  SpecialRulesPanel: () => null,
}));
vi.mock("@/components/progress/WarningCenter", () => ({
  WarningCenter: () => null,
}));

describe("PlannerApp composition", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("opens onboarding on first visit and lets Guide reopen it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlannerApp />);

    expect(await screen.findByText("Choose your program")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Skip guide" }));

    await waitFor(() => {
      expect(window.localStorage.getItem(ONBOARDING_KEY)).not.toBeNull();
      expect(screen.queryByText("Choose your program")).toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "Guide" }));
    expect(await screen.findByText("Choose your program")).toBeDefined();
  });

  it("places announcement and inspiration before the workspace and renders eight semesters", () => {
    renderWithProviders(<PlannerApp />);

    const inspiration = screen.getByTestId("inspiration");
    const announcement = screen.getByTestId("announcement");
    const workspace = screen.getByTestId("workspace");
    expect(
      announcement.compareDocumentPosition(inspiration) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      inspiration.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guide" })).toBeDefined();
    expect(screen.getAllByTestId(/^semester-/)).toHaveLength(8);
  });
});
