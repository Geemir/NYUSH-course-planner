// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlanSyncStatus } from "@/components/layout/PlanSyncStatus";
import type { PlanSnapshotV2 } from "@/lib/types";

const snapshot: PlanSnapshotV2 = {
  version: 2,
  catalogReleaseId: "release",
  placements: [],
  studyAway: {},
  completedSemesters: [],
  programProfile: { coreProgramId: "core", primaryMajorId: "cs", secondMajorId: null, minorIds: [] },
  unresolvedProgramIds: [],
  customCourses: [],
  fulfillmentFacts: [],
  dismissedWarnings: [],
  startYear: 2026,
};

describe("PlanSyncStatus", () => {
  it.each([
    [{ status: "saving", baseRevision: 1 } as const, "Saving"],
    [{ status: "saved", revision: 2, savedAt: "2026-07-18T00:00:00.000Z" } as const, "Saved"],
    [{ status: "offline", pending: true, message: "Offline" } as const, "Offline — changes kept locally"],
    [{ status: "error", pending: true, message: "Error" } as const, "Could not sync"],
    [{ status: "local-only", message: "Saved on this device." } as const, "Saved on this device."],
  ])("announces %s state", (state, label) => {
    render(<PlanSyncStatus state={state} />);
    expect(screen.getByRole("status").textContent).toContain(label);
  });

  it("offers retry for a pending failure", () => {
    const onRetry = vi.fn();
    render(<PlanSyncStatus state={{ status: "error", pending: true, message: "Error" }} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("preserves both conflict choices and dispatches explicit actions", () => {
    const onKeepLocal = vi.fn();
    const onUseServer = vi.fn();
    const onExportBoth = vi.fn();
    render(
      <PlanSyncStatus
        state={{
          status: "conflict",
          local: snapshot,
          server: { snapshot: { ...snapshot, startYear: 2025 }, revision: 3, updatedAt: "2026-07-18T00:00:00.000Z" },
        }}
        onKeepLocal={onKeepLocal}
        onUseServer={onUseServer}
        onExportBoth={onExportBoth}
      />,
    );
    expect(screen.getByRole("dialog").textContent).toContain("Nothing has been overwritten");
    fireEvent.click(screen.getByRole("button", { name: "Export both" }));
    fireEvent.click(screen.getByRole("button", { name: "Use server" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep local" }));
    expect(onExportBoth).toHaveBeenCalledOnce();
    expect(onUseServer).toHaveBeenCalledOnce();
    expect(onKeepLocal).toHaveBeenCalledOnce();
  });
});
