// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import { AdminAnnouncements } from "@/components/admin/AdminAnnouncements";

const draft = {
  id: "notice-1", title: "Draft notice", body: "Draft body", tone: "info",
  linkUrl: null, linkLabel: null, status: "draft", publishedAt: null, expiresAt: null,
  createdBy: "admin-1", createdAt: "2026-07-29T00:00:00.000Z", updatedAt: "2026-07-29T00:00:00.000Z",
};

describe("AdminAnnouncements", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads a readable lifecycle list with draft actions visible", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ items: [draft] })));
    render(<AdminAnnouncements />);

    expect(await screen.findByText("Draft notice")).toBeDefined();
    expect(screen.getByText("Draft")).toBeDefined();
    expect(screen.getByRole("button", { name: "Edit Draft notice" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Publish Draft notice" })).toBeDefined();
  });

  it("validates and saves a new draft", async () => {
    const user = userEvent.setup();
    const requests: Array<{ method: string; body?: unknown }> = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "POST") {
        requests.push({ method, body: JSON.parse(String(init?.body)) });
        return Response.json({ ...draft, id: "notice-2", title: "Registration reminder" }, { status: 201 });
      }
      return Response.json({ items: [] });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<AdminAnnouncements />);
    await screen.findByText("No announcement history yet.");

    const save = screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Registration reminder");
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Review your course plan.");
    expect(save.disabled).toBe(false);
    await user.click(save);

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      method: "POST",
      body: { title: "Registration reminder", body: "Review your course plan.", tone: "info" },
    });
  });

  it("confirms publication and withdrawal before mutating lifecycle state", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const actions: string[] = [];
    let items = [draft];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        actions.push(body.action);
        items = [{ ...draft, status: body.action === "publish" ? "published" : "archived" }];
        return Response.json(items[0]);
      }
      return Response.json({ items });
    }));
    render(<AdminAnnouncements />);

    await user.click(await screen.findByRole("button", { name: "Publish Draft notice" }));
    await waitFor(() => expect(actions).toEqual(["publish"]));
    await user.click(await screen.findByRole("button", { name: "Withdraw Draft notice" }));
    await waitFor(() => expect(actions).toEqual(["publish", "archive"]));
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("shows a bounded load error instead of an empty editor crash", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "internal_error" }, { status: 500 })));
    render(<AdminAnnouncements />);
    expect((await screen.findByRole("alert")).textContent).toContain("Could not load announcements.");
  });
});
