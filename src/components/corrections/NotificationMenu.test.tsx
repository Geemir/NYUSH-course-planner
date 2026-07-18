// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationMenu } from "@/components/corrections/NotificationMenu";
import { render, screen } from "@/test/render";

const item = { id: "notification-1", requestId: "report-1", title: "More information needed", body: "Please share a source.", readAt: null, createdAt: "2026-07-18T00:00:00Z" };

describe("NotificationMenu", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("loads on open, shows unread owner items, and marks one read before opening its report", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => init?.method === "PATCH"
      ? new Response(JSON.stringify({ updated: 1 }), { status: 200 })
      : new Response(JSON.stringify({ items: [item], unreadCount: 1 }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const openReport = vi.fn(); const user = userEvent.setup();
    render(<NotificationMenu onOpenReport={openReport} />);
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await user.click(await screen.findByRole("button", { name: /More information needed/ }));
    expect(openReport).toHaveBeenCalledWith("report-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications", expect.objectContaining({ method: "PATCH" }));
  });

  it("does not refresh while the document is hidden", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    render(<NotificationMenu onOpenReport={() => undefined} />);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });
});
