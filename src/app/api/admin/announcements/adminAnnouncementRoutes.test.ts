import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  listAnnouncements: vi.fn(),
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  publishAnnouncement: vi.fn(),
  archiveAnnouncement: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/adminAuth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/announcements/repository", async () => ({
  ...(await vi.importActual<typeof import("@/lib/announcements/repository")>("@/lib/announcements/repository")),
  listAnnouncements: mocks.listAnnouncements,
  createDraft: mocks.createDraft,
  updateDraft: mocks.updateDraft,
  publishAnnouncement: mocks.publishAnnouncement,
  archiveAnnouncement: mocks.archiveAnnouncement,
}));

import { GET, POST } from "./route";
import { PATCH } from "./[id]/route";
import { AnnouncementConflictError, AnnouncementNotFoundError } from "@/lib/announcements/repository";

const valid = {
  title: "Advising week", body: "Review your plan.", tone: "warning",
  linkUrl: null, linkLabel: null, expiresAt: null,
};

const context = (id = "notice-1") => ({ params: Promise.resolve({ id }) }) as RouteContext<"/api/admin/announcements/[id]">;

describe("Admin announcement routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ ok: true, userId: "admin-1" });
  });

  it.each([
    [{ error: "unauthorized", status: 401 }, 401],
    [{ error: "forbidden", status: 403 }, 403],
  ] as const)("gates requests before parsing with %o", async (gate, status) => {
    mocks.requireAdminUser.mockResolvedValue(gate);
    const json = vi.fn();

    const response = await POST({ json } as unknown as Request);

    expect(response.status).toBe(status);
    expect(json).not.toHaveBeenCalled();
    expect(mocks.createDraft).not.toHaveBeenCalled();
  });

  it("lists history and creates a draft for the authenticated admin", async () => {
    mocks.listAnnouncements.mockResolvedValue([{ id: "notice-1" }]);
    mocks.createDraft.mockResolvedValue({ id: "notice-2", status: "draft" });

    const listResponse = await GET();
    const createResponse = await POST(new Request("http://localhost/api/admin/announcements", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valid),
    }));

    await expect(listResponse.json()).resolves.toEqual({ items: [{ id: "notice-1" }] });
    expect(createResponse.status).toBe(201);
    expect(mocks.createDraft).toHaveBeenCalledWith({}, valid, "admin-1");
  });

  it("distinguishes malformed JSON from invalid announcement data", async () => {
    const malformed = await POST(new Request("http://localhost/api/admin/announcements", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
    }));
    const invalid = await POST(new Request("http://localhost/api/admin/announcements", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...valid, title: "" }),
    }));

    expect(malformed.status).toBe(400);
    expect(invalid.status).toBe(422);
  });

  it.each([
    [{ action: "update", announcement: valid }, "updateDraft"],
    [{ action: "publish" }, "publishAnnouncement"],
    [{ action: "archive" }, "archiveAnnouncement"],
  ] as const)("dispatches %o", async (action, method) => {
    mocks[method].mockResolvedValue({ id: "notice-1", status: action.action === "publish" ? "published" : "draft" });
    const response = await PATCH(new Request("http://localhost/api/admin/announcements/notice-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action),
    }), context());

    expect(response.status).toBe(200);
    expect(mocks[method]).toHaveBeenCalled();
  });

  it("maps missing and stale lifecycle changes without leaking details", async () => {
    mocks.publishAnnouncement.mockRejectedValueOnce(new AnnouncementNotFoundError("notice-1"));
    const missing = await PATCH(new Request("http://localhost/api/admin/announcements/notice-1", {
      method: "PATCH", body: JSON.stringify({ action: "publish" }),
    }), context());
    mocks.publishAnnouncement.mockRejectedValueOnce(new AnnouncementConflictError("private state"));
    const conflict = await PATCH(new Request("http://localhost/api/admin/announcements/notice-1", {
      method: "PATCH", body: JSON.stringify({ action: "publish" }),
    }), context());

    expect(missing.status).toBe(404);
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toEqual({ error: "announcement_conflict" });
  });

  it("serializes unexpected failures safely", async () => {
    mocks.listAnnouncements.mockRejectedValue(new Error("secret database failure"));
    const response = await GET();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "internal_error" });
  });
});
