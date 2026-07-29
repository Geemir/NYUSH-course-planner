// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlanningSlotCard } from "@/components/planner/PlanningSlotCard";
import type { PlanningSlot } from "@/lib/types";
import { render, screen } from "@/test/render";

const slot: PlanningSlot = {
  id: "slot-1", sourceKey: "cs:sample:5:0:computer-science-elective", semesterId: "Y3F",
  label: "Computer Science Elective", credits: 4,
  source: { kind: "bulletin-sample-plan", programId: "cs", catalogReleaseId: "release-1", sectionId: "sample", termSourceIndex: 4, rowSourceIndex: 0 },
};

describe("PlanningSlotCard", () => {
  it("labels tentative workload and opens a scoped catalog search", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(<PlanningSlotCard slot={slot} onChoose={onChoose} />);
    expect(screen.getByText("Computer Science Elective")).toBeDefined();
    expect(screen.getByText("Tentative · 4 cr")).toBeDefined();
    await user.click(screen.getByRole("button", { name: /choose course/i }));
    expect(onChoose).toHaveBeenCalledWith({ query: "Computer Science Elective", slotId: "slot-1", semesterId: "Y3F" });
  });
});
