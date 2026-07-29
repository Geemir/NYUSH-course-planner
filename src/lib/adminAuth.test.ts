import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
vi.mock("@/auth", () => ({ auth }));

describe("maintainer authorization", () => {
  beforeEach(() => auth.mockReset());

  it.each(["admin", "maintainer"])("allows %s users to maintain the catalog", async (role) => {
    auth.mockResolvedValue({ user: { id: "user-1", role } });
    const { requireMaintainerUser } = await import("@/lib/adminAuth");
    await expect(requireMaintainerUser()).resolves.toEqual({ ok: true, userId: "user-1", role });
  });

  it("rejects students", async () => {
    auth.mockResolvedValue({ user: { id: "student-1", role: "student" } });
    const { requireMaintainerUser } = await import("@/lib/adminAuth");
    await expect(requireMaintainerUser()).resolves.toEqual({ error: "forbidden", status: 403 });
  });
});
