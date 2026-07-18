// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminCorrections } from "@/components/admin/AdminCorrections";
import type { AdminCorrectionDetail, CorrectionStatus } from "@/lib/corrections/types";
import { render, screen, waitFor } from "@/test/render";

function report(status: CorrectionStatus): AdminCorrectionDetail {
  return {
    id: "report-1", ownerUserId: "student-1", assignedTo: null, duplicateOfId: null,
    target: { kind: "course", stableId: "stern:TEST-UA 1" }, issueType: "incorrect_course_information",
    title: "Incorrect course title", status, withdrawnAt: null, createdAt: "2026-07-18T00:00:00Z", updatedAt: "2026-07-18T00:00:00Z",
    catalogReleaseId: "release-1", context: { displayedValue: "TEST-UA 1 — Old title", sourceUrl: "https://bulletins.nyu.edu/course" },
    description: "The source title differs from the title shown in the planner.", suggestedCorrection: "Use the current Bulletin title.", evidenceUrl: "https://nyu.edu/evidence",
    messages: [], events: [{ id: "event-public", eventType: "submitted", fromStatus: null, toStatus: "submitted", publicNote: "Report submitted.", createdAt: "2026-07-18T00:00:00Z" }],
    privateEvents: [{ id: "event-private", eventType: "review", fromStatus: "submitted", toStatus: "in_review", publicNote: null, privateNote: "Check the archived page.", actorUserId: "admin-1", createdAt: "2026-07-18T00:10:00Z" }],
  };
}

describe("AdminCorrections", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows filters, source/evidence, separated notes, and review transitions", async () => {
    const current = report("in_review");
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => init?.method === "POST"
      ? new Response(JSON.stringify({ ...current, status: "approved" }), { status: 200, headers: { "Content-Type": "application/json" } })
      : new Response(JSON.stringify({ items: [current], counts: { in_review: 1 }, nextCursor: null }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock); const user = userEvent.setup();
    render(<AdminCorrections />);

    expect(await screen.findByText("TEST-UA 1 — Old title")).toBeDefined();
    expect(screen.getByRole("textbox", { name: "Search reports" })).toBeDefined();
    expect(screen.getByRole("combobox", { name: "Target type" })).toBeDefined();
    expect(screen.getByText("Check the archived page.")).toBeDefined();
    await user.type(screen.getByLabelText("Public note"), "Evidence verified.");
    await user.type(screen.getByLabelText("Private reviewer note"), "Internal rationale.");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/corrections/report-1/transition", expect.objectContaining({ method: "POST" })));
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/transition"));
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ toStatus: "approved", publicNote: "Evidence verified.", privateNote: "Internal rationale." });
  });

  it("keeps approval separate from a confirmed typed apply", async () => {
    const current = report("approved");
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => init?.method === "POST"
      ? new Response(JSON.stringify({ request: { ...current, status: "applied" }, overlay: { id: "overlay-1" } }), { status: 200, headers: { "Content-Type": "application/json" } })
      : new Response(JSON.stringify({ items: [current], counts: { approved: 1 }, nextCursor: null }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock); vi.spyOn(window, "confirm").mockReturnValue(true); const user = userEvent.setup();
    render(<AdminCorrections />);
    await user.type(await screen.findByLabelText("Corrected title"), "Reviewed title");
    await user.click(screen.getByRole("button", { name: "Confirm and apply" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/apply"))).toBe(true));
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/apply"));
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ kind: "course", stableId: "stern:TEST-UA 1", changes: { title: "Reviewed title" } });
  });
});
