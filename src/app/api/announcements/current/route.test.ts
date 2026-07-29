import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentAnnouncement = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/announcements/repository", () => ({ getCurrentAnnouncement }));

describe("GET /api/announcements/current", () => {
  beforeEach(() => {
    getCurrentAnnouncement.mockReset();
  });

  it("is public, no-store, and returns the current public DTO", async () => {
    getCurrentAnnouncement.mockResolvedValue({
      id: "notice-1", title: "Welcome", body: "Plan early.", tone: "info",
      linkUrl: null, linkLabel: null, publishedAt: "2026-07-29T00:00:00.000Z", expiresAt: null,
    });
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({ announcement: { id: "notice-1" } });
  });

  it("returns a bounded empty result when nothing is published", async () => {
    getCurrentAnnouncement.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET();
    await expect(response.json()).resolves.toEqual({ announcement: null });
  });

  it("does not expose database errors", async () => {
    getCurrentAnnouncement.mockImplementation(() => {
      throw new Error("password in SQL error");
    });
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "internal_error" });
  });
});
