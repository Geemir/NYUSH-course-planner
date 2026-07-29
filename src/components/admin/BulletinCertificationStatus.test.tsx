// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test/render";
import { BulletinCertificationStatus } from "./BulletinCertificationStatus";

const payload = {
  releaseId: "release-1",
  activeCourseCount: 810,
  summary: { programCount: 2, pass: 1, partial: 1 },
  programs: [
    { programId: "computer-science-bs", interpretationCoverage: 1, unavailableGroups: [], selectorCount: 2, manualConfirmationCount: 0, samplePlanImportStatus: "eligible" },
    { programId: "data-science-bs", interpretationCoverage: 0.67, unavailableGroups: ["Electives"], selectorCount: 4, manualConfirmationCount: 0, samplePlanImportStatus: "eligible" },
  ],
};

describe("BulletinCertificationStatus", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders loading, summary, and partial-program filtering", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    const user = userEvent.setup();
    render(<BulletinCertificationStatus />);
    expect(screen.getByText(/Loading Bulletin certification/i)).toBeDefined();
    expect(await screen.findByText(/Active release release-1/i)).toBeDefined();
    expect(screen.getByText("data-science-bs")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Partial only" }));
    expect(screen.queryByText("computer-science-bs")).toBeNull();
    expect(screen.getByText("Electives")).toBeDefined();
  });

  it("renders a read-only error state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<BulletinCertificationStatus />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not be loaded/i);
    expect(screen.queryByRole("button", { name: /publish|override/i })).toBeNull();
  });
});
