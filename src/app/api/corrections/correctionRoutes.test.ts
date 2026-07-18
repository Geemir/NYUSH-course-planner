import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  auth: vi.fn(), create: vi.fn(), list: vi.fn(), read: vi.fn(), withdraw: vi.fn(), message: vi.fn(),
  notifications: vi.fn(), mark: vi.fn(), rate: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: stubs.auth }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/corrections/rateLimit", () => ({ createDatabaseCorrectionRateLimiter: () => ({ check: stubs.rate }) }));
vi.mock("@/lib/corrections/repository", async (original) => {
  const actual = await original<typeof import("@/lib/corrections/repository")>();
  return { ...actual, createCorrection: stubs.create, listUserCorrections: stubs.list, readUserCorrection: stubs.read, withdrawCorrection: stubs.withdraw, addUserMessage: stubs.message, listNotifications: stubs.notifications, markNotificationsRead: stubs.mark };
});

import { GET as list, POST as create } from "@/app/api/corrections/route";
import { GET as detail, PATCH as update } from "@/app/api/corrections/[id]/route";
import { POST as message } from "@/app/api/corrections/[id]/messages/route";
import { GET as notifications, PATCH as markNotifications } from "@/app/api/notifications/route";

const context = (id = "request") => ({ params: Promise.resolve({ id }) });
const valid = { target: { kind: "course", stableId: "stern:TEST-UA 1" }, issueType: "incorrect_course_information", catalogReleaseId: "release", context: {}, title: "Wrong description", description: "The current description does not match the Bulletin source." };

describe("private correction routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubs.auth.mockResolvedValue({ user: { id: "owner" } });
    stubs.rate.mockResolvedValue({ allowed: true, retryAfter: 0 });
    stubs.list.mockResolvedValue({ items: [], nextCursor: null });
    stubs.create.mockResolvedValue({ id: "request" });
    stubs.read.mockResolvedValue({ id: "request" });
    stubs.withdraw.mockResolvedValue({ id: "request", withdrawnAt: "now" });
    stubs.message.mockResolvedValue({ id: "message" });
    stubs.notifications.mockResolvedValue([]);
    stubs.mark.mockResolvedValue([]);
  });

  it("requires authentication across student and notification routes", async () => {
    stubs.auth.mockResolvedValue(null);
    expect((await list(new Request("http://local/api/corrections"))).status).toBe(401);
    expect((await create(new Request("http://local/api/corrections", { method: "POST", body: "{}" }))).status).toBe(401);
    expect((await detail(new Request("http://local"), context())).status).toBe(401);
    expect((await notifications(new Request("http://local/api/notifications"))).status).toBe(401);
  });

  it("creates a bounded validated report and sets private no-store", async () => {
    const response = await create(new Request("http://local/api/corrections", { method: "POST", body: JSON.stringify(valid) }));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(stubs.create).toHaveBeenCalledWith({}, "owner", expect.objectContaining({ title: "Wrong description" }));
    expect((await create(new Request("http://local", { method: "POST", body: "{}" }))).status).toBe(400);
  });

  it("returns 429 with Retry-After without parsing report data", async () => {
    stubs.rate.mockResolvedValue({ allowed: false, retryAfter: 45 });
    const response = await create(new Request("http://local", { method: "POST", body: "bad" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("45");
    expect(stubs.create).not.toHaveBeenCalled();
  });

  it("uses owner predicates and hides missing or other-user IDs behind 404", async () => {
    stubs.read.mockResolvedValue(null);
    expect((await detail(new Request("http://local"), context("other"))).status).toBe(404);
    expect(stubs.read).toHaveBeenCalledWith({}, "owner", "other");
  });

  it("validates withdrawal and message actions", async () => {
    expect((await update(new Request("http://local", { method: "PATCH", body: JSON.stringify({ action: "withdraw" }) }), context())).status).toBe(200);
    expect((await update(new Request("http://local", { method: "PATCH", body: JSON.stringify({ action: "delete" }) }), context())).status).toBe(400);
    expect((await message(new Request("http://local", { method: "POST", body: JSON.stringify({ body: "Additional public context" }) }), context())).status).toBe(201);
  });

  it("marks only authenticated-owner notifications with bounded input", async () => {
    stubs.notifications.mockResolvedValue([{ id: "one", readAt: null }]);
    expect(await (await notifications(new Request("http://local/api/notifications"))).json()).toMatchObject({ unreadCount: 1 });
    await markNotifications(new Request("http://local", { method: "PATCH", body: JSON.stringify({ ids: ["one"] }) }));
    expect(stubs.mark).toHaveBeenCalledWith({}, "owner", { ids: ["one"] });
    expect((await markNotifications(new Request("http://local", { method: "PATCH", body: JSON.stringify({ ids: [] }) }))).status).toBe(400);
  });
});
