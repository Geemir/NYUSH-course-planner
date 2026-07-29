// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WarningCenter } from "@/components/progress/WarningCenter";
import { render, screen } from "@/test/render";

const { derived } = vi.hoisted(() => ({
  derived: {
    warnings: [{
      id: "not-offered:TEST 1:Y2S",
      kind: "not-offered",
      severity: "warning",
      courseId: "TEST 1",
      semesterId: "Y2S",
      message: "TEST 1 is not usually offered in spring.",
    }],
    dismissedWarnings: [],
  },
}));

vi.mock("@/hooks/usePlanDerived", () => ({ usePlanDerived: () => derived }));

describe("WarningCenter", () => {
  it("opens a prefilled report without dismissing the warning", async () => {
    const user = userEvent.setup();
    render(<WarningCenter />);
    await user.click(screen.getByRole("button", { name: "Report warning" }));

    expect(screen.getByRole("heading", { name: "Report an issue" })).toBeDefined();
    expect(screen.getByText("Planning warning · TEST 1")).toBeDefined();
    expect(screen.getAllByText(/TEST 1 is not usually offered/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("warning-center")).toBeDefined();
  });
});
