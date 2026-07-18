import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  auth: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: stubs.auth }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/repository", () => ({
  getActivePlanEnvelope: stubs.get,
  saveActivePlanRevision: stubs.save,
}));

import { GET, PUT } from "@/app/api/plan/route";

const snapshot = {
  version: 2 as const,
  catalogReleaseId: "release",
  placements: [], studyAway: {}, completedSemesters: [],
  programProfile: { coreProgramId: "core", primaryMajorId: "cs", secondMajorId: null, minorIds: [] },
  unresolvedProgramIds: [], customCourses: [], fulfillmentFacts: [],
  dismissedWarnings: [], startYear: 2026,
};
const serverEnvelope = {
  snapshot,
  revision: 2,
  updatedAt: "2026-07-18T00:00:00.000Z",
};

describe("plan route revisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubs.auth.mockResolvedValue({ user: { id: "user" } });
    stubs.get.mockResolvedValue(serverEnvelope);
    stubs.save.mockResolvedValue({ status: "saved", plan: serverEnvelope });
  });

  it("requires authentication for reads and writes", async () => {
    stubs.auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await PUT(new Request("http://local/api/plan", { method: "PUT", body: "{}" }))).status).toBe(401);
  });

  it("returns the exact active envelope", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(serverEnvelope);
  });

  it("rejects malformed and v1 save bodies", async () => {
    const malformed = await PUT(new Request("http://local/api/plan", { method: "PUT", body: "bad" }));
    expect(malformed.status).toBe(400);
    const v1 = await PUT(new Request("http://local/api/plan", {
      method: "PUT",
      body: JSON.stringify({ snapshot: { version: 1 }, baseRevision: null }),
    }));
    expect(v1.status).toBe(400);
  });

  it("saves first and matched revisions", async () => {
    for (const baseRevision of [null, 1]) {
      const response = await PUT(new Request("http://local/api/plan", {
        method: "PUT",
        body: JSON.stringify({ snapshot, baseRevision }),
      }));
      expect(response.status).toBe(200);
      expect(stubs.save).toHaveBeenLastCalledWith({}, "user", snapshot, baseRevision);
    }
  });

  it("returns a non-destructive 409 conflict payload", async () => {
    stubs.save.mockResolvedValue({ status: "conflict", server: serverEnvelope });
    const response = await PUT(new Request("http://local/api/plan", {
      method: "PUT",
      body: JSON.stringify({ snapshot, baseRevision: 1 }),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "revision_conflict", server: serverEnvelope });
  });
});
