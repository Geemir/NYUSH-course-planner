// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportIssueDialog } from "@/components/corrections/ReportIssueDialog";
import { render, screen, waitFor } from "@/test/render";

const context = {
  target: { kind: "course" as const, stableId: "stern:TEST-UA 1" },
  catalogReleaseId: "release-1", sourceId: "stern", sourceSnapshotId: "snapshot-1",
  tableId: "course-list", sourceIndex: 7,
  sourceUrl: "https://bulletins.nyu.edu/course", displayedValue: "TEST-UA 1 — Seminar", label: "TEST-UA 1 · Seminar",
};

describe("ReportIssueDialog", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves contextual source evidence and submits the typed report", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: "report-1" }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReportIssueDialog open onOpenChange={() => undefined} context={context} />);

    expect(screen.getByText("TEST-UA 1 — Seminar")).toBeDefined();
    expect(screen.getByRole("link", { name: /immutable source reference/i }).getAttribute("href")).toBe(context.sourceUrl);
    expect(screen.queryByLabelText(/attachment/i)).toBeNull();
    expect(screen.getByText(/not an official NYU decision/i)).toBeDefined();
    await user.type(screen.getByLabelText("Title"), "Course title mismatch");
    await user.type(screen.getByLabelText("What appears to be wrong?"), "The title differs from the current official Bulletin entry.");
    await user.type(screen.getByLabelText(/Evidence link/), "https://nyu.edu/evidence");
    await user.click(screen.getByRole("button", { name: "Submit report" }));

    await screen.findByRole("heading", { name: "Report submitted" });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ target: context.target, catalogReleaseId: "release-1", context: { sourceSnapshotId: "snapshot-1", tableId: "course-list", sourceIndex: 7 } });
  });

  it("shows local validation and rate-limit states", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    render(<ReportIssueDialog open onOpenChange={() => undefined} context={context} />);
    await user.click(screen.getByRole("button", { name: "Submit report" }));
    expect(screen.getByRole("alert").textContent).toMatch(/at least 20/i);
    await user.type(screen.getByLabelText("Title"), "Wrong title");
    await user.type(screen.getByLabelText("What appears to be wrong?"), "This is a sufficiently detailed explanation of the issue.");
    await user.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Too many recent reports/i));
  });
});
