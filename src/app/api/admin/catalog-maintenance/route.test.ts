import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  gate: vi.fn(), list: vi.fn(), apply: vi.fn(), setActive: vi.fn(), bootstrap: vi.fn(),
}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/adminAuth", () => ({ requireMaintainerUser: stubs.gate }));
vi.mock("@/lib/catalogMaintenance/repository", () => ({
  listDirectCatalogOverlays: stubs.list,
  applyDirectCatalogOverlay: stubs.apply,
  setCatalogOverlayActive: stubs.setActive,
}));
vi.mock("@/lib/catalog/searchRepository", () => ({ readCatalogBootstrap: stubs.bootstrap }));

describe("catalog maintenance routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubs.gate.mockResolvedValue({ ok: true, userId: "maintainer-1", role: "maintainer" });
    stubs.list.mockResolvedValue([]);
    stubs.bootstrap.mockResolvedValue({ release: { id: "release-1" }, programs: [{ id: "core" }] });
  });

  it("rejects students before repository access", async () => {
    stubs.gate.mockResolvedValue({ error: "forbidden", status: 403 });
    const { GET } = await import("@/app/api/admin/catalog-maintenance/route");
    const response = await GET();
    expect(response.status).toBe(403);
    expect(stubs.list).not.toHaveBeenCalled();
  });

  it("lists editable programs and direct overlay history for maintainers", async () => {
    const { GET } = await import("@/app/api/admin/catalog-maintenance/route");
    const response = await GET();
    await expect(response.json()).resolves.toEqual({ releaseId: "release-1", programs: [{ id: "core" }], overlays: [] });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("validates and immediately publishes a direct overlay", async () => {
    stubs.apply.mockResolvedValue({ id: "overlay-1", status: "active" });
    const { POST } = await import("@/app/api/admin/catalog-maintenance/route");
    const input = { patch: { kind: "course-delete", stableId: "nyu-shanghai:TEST-SHU 1" }, reason: "Duplicate source record.", sourceReleaseId: "release-1" };
    const response = await POST(new Request("http://local/api/admin/catalog-maintenance", { method: "POST", body: JSON.stringify(input) }));
    expect(response.status).toBe(201);
    expect(stubs.apply).toHaveBeenCalledWith({}, "maintainer-1", input);
  });

  it("reverts an overlay with an audited reason", async () => {
    stubs.setActive.mockResolvedValue({ id: "overlay-1", status: "superseded" });
    const { PATCH } = await import("@/app/api/admin/catalog-maintenance/[id]/route");
    const response = await PATCH(new Request("http://local", { method: "PATCH", body: JSON.stringify({ active: false, reason: "Rechecking source." }) }), { params: Promise.resolve({ id: "overlay-1" }) });
    expect(response.status).toBe(200);
    expect(stubs.setActive).toHaveBeenCalledWith({}, "maintainer-1", "overlay-1", false, "Rechecking source.");
  });
});
