// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyReportsSheet } from "@/components/corrections/MyReportsSheet";
import { render, screen } from "@/test/render";

const summary = { id: "report-1", target: { kind: "course" as const, stableId: "course-1" }, issueType: "incorrect_course_information" as const, title: "Course title mismatch", status: "needs_information" as const, withdrawnAt: null, createdAt: "2026-07-18T00:00:00Z", updatedAt: "2026-07-18T01:00:00Z" };
const detail = { ...summary, catalogReleaseId: "release-1", context: {}, description: "The official title appears to be different.", suggestedCorrection: null, evidenceUrl: null, messages: [{ id: "message-1", body: "Could you share the source?", author: "maintainer" as const, createdAt: "2026-07-18T01:00:00Z" }], events: [{ id: "event-1", eventType: "needs_information", fromStatus: "in_review" as const, toStatus: "needs_information" as const, publicNote: "Please provide a source.", createdAt: "2026-07-18T01:00:00Z" }] };

describe("MyReportsSheet", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists only the API-provided owner reports and opens public history", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("report-1")
      ? new Response(JSON.stringify(detail), { status: 200, headers: { "Content-Type": "application/json" } })
      : new Response(JSON.stringify({ items: [summary], nextCursor: null }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<MyReportsSheet open onOpenChange={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: /Course title mismatch/ }));
    expect(await screen.findByText("Could you share the source?")).toBeDefined();
    expect(screen.getByText("Please provide a source.")).toBeDefined();
    expect(screen.getByRole("textbox", { name: "Reply to maintainers" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Withdraw report" })).toBeDefined();
    expect(screen.getByText(/not an official NYU decision/i)).toBeDefined();
  });

  it("renders an owner-safe empty state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200, headers: { "Content-Type": "application/json" } })));
    render(<MyReportsSheet open onOpenChange={() => undefined} />);
    expect(await screen.findByText(/have not submitted any reports/i)).toBeDefined();
  });
});
