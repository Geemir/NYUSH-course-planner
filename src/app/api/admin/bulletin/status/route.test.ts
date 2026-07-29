import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  gate: vi.fn(),
  bootstrap: vi.fn(),
  sources: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/adminAuth", () => ({ requireMaintainerUser: stubs.gate }));
vi.mock("@/lib/catalog/searchRepository", () => ({ readCatalogBootstrap: stubs.bootstrap }));
vi.mock("@/lib/catalogRepository", () => ({ getCatalogSourceStatuses: stubs.sources }));

const program = (id: string, unavailable = false) => ({
  id,
  auditAuthority: "nyush-bulletin",
  interpretations: [
    {
      name: unavailable ? "Electives" : "Probability",
      status: unavailable ? "unavailable" : "verified",
      requirement: unavailable
        ? null
        : { kind: "choose", count: 1, children: [{ kind: "course", courseId: "A" }, { kind: "course", courseId: "B" }] },
    },
  ],
  samplePlan: id === "computer-science-bs" ? { importStatus: "eligible" } : undefined,
});

describe("admin Bulletin certification status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubs.gate.mockResolvedValue({ ok: true, role: "maintainer", userId: "m1" });
    stubs.bootstrap.mockResolvedValue({
      release: { id: "release-1" },
      programs: [program("z-program", true), program("computer-science-bs")],
    });
    stubs.sources.mockResolvedValue([{ sourceId: "nyu-shanghai", activeCourseCount: 810 }]);
  });

  it("rejects unauthorized users before reading catalog state", async () => {
    stubs.gate.mockResolvedValue({ error: "forbidden", status: 403 });
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(403);
    expect(stubs.bootstrap).not.toHaveBeenCalled();
  });

  it("returns deterministic per-program coverage for maintainers", async () => {
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toMatchObject({
      releaseId: "release-1",
      activeCourseCount: 810,
      summary: { programCount: 2, pass: 1, partial: 1 },
      programs: [
        {
          programId: "computer-science-bs",
          interpretationCoverage: 1,
          selectorCount: 1,
          samplePlanImportStatus: "eligible",
        },
        {
          programId: "z-program",
          interpretationCoverage: 0,
          unavailableGroups: ["Electives"],
        },
      ],
    });
  });
});
