import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({ gate: vi.fn(), list: vi.fn(), transition: vi.fn(), merge: vi.fn(), apply: vi.fn(), read: vi.fn(), catalog: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/adminAuth", () => ({ requireAdminUser: stubs.gate }));
vi.mock("@/lib/catalogRepository", () => ({ getActiveReleaseCatalog: stubs.catalog }));
vi.mock("@/lib/corrections/repository", async (original) => {
  const actual = await original<typeof import("@/lib/corrections/repository")>();
  return { ...actual, listAdminCorrections: stubs.list, transitionCorrection: stubs.transition, mergeDuplicateCorrection: stubs.merge, applyCorrectionOverlay: stubs.apply, readAdminCorrection: stubs.read };
});

import { GET as inbox } from "@/app/api/admin/corrections/route";
import { POST as transition } from "@/app/api/admin/corrections/[id]/transition/route";
import { POST as merge } from "@/app/api/admin/corrections/[id]/merge/route";
import { POST as apply } from "@/app/api/admin/corrections/[id]/apply/route";
import { CorrectionConflictError } from "@/lib/corrections/repository";

const context = { params: Promise.resolve({ id: "request" }) };
const req = (body: unknown) => new Request("http://local", { method: "POST", body: JSON.stringify(body) });
const catalog = { release: { id: "release" }, courses: [{ stableId: "stern:TEST-UA 1" }], programs: [{ id: "cs", categories: [{ id: "elective" }] }] };

describe("admin correction routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubs.gate.mockResolvedValue({ ok: true, userId: "admin" });
    stubs.list.mockResolvedValue({ items: [], counts: {}, nextCursor: null });
    stubs.transition.mockResolvedValue({ id: "request", status: "in_review" });
    stubs.merge.mockResolvedValue({ id: "request", status: "rejected" });
    stubs.apply.mockResolvedValue({ request: { status: "applied" }, overlay: { id: "overlay" } });
    stubs.read.mockResolvedValue({ id: "request", catalogReleaseId: "release" });
    stubs.catalog.mockResolvedValue(catalog);
  });

  it("preserves 401/403 admin boundaries", async () => {
    for (const gate of [{ error: "unauthorized", status: 401 }, { error: "forbidden", status: 403 }]) {
      stubs.gate.mockResolvedValueOnce(gate);
      expect((await inbox(new Request("http://local/api/admin/corrections"))).status).toBe(gate.status);
    }
  });

  it("passes bounded inbox filters and self assignment", async () => {
    const response = await inbox(new Request("http://local/api/admin/corrections?status=submitted&targetKind=course&assigned=me&q=description"));
    expect(response.status).toBe(200);
    expect(stubs.list).toHaveBeenCalledWith({}, expect.objectContaining({ status: "submitted", targetKind: "course", assignedTo: "admin", q: "description" }));
  });

  it("validates and transition-checks review actions", async () => {
    expect((await transition(req({ toStatus: "approved", assignToSelf: true }), context)).status).toBe(200);
    stubs.transition.mockRejectedValueOnce(new CorrectionConflictError("bad"));
    expect((await transition(req({ toStatus: "approved" }), context)).status).toBe(409);
    expect((await transition(req({ toStatus: "applied" }), context)).status).toBe(400);
  });

  it("merges through the audited compatible-target repository operation", async () => {
    expect((await merge(req({ canonicalRequestId: "canonical", publicNote: "Matches the same course report." }), context)).status).toBe(200);
    expect(stubs.merge).toHaveBeenCalledWith({}, "admin", "request", "canonical", "Matches the same course report.");
  });

  it("keeps approval separate from validated current-release application", async () => {
    expect((await apply(req({ kind: "course", stableId: "stern:TEST-UA 1", changes: { title: "Reviewed title" } }), context)).status).toBe(200);
    expect(stubs.apply).toHaveBeenCalledWith({}, "admin", "request", expect.objectContaining({ kind: "course" }), "release");
    expect((await apply(req({ kind: "course", stableId: "stern:TEST-UA 1", changes: { sourceId: "attacker" } }), context)).status).toBe(400);
  });

  it("rejects stale releases and missing current targets before insertion", async () => {
    stubs.read.mockResolvedValueOnce({ id: "request", catalogReleaseId: "old" });
    expect((await apply(req({ kind: "course", stableId: "stern:TEST-UA 1", changes: { title: "Reviewed" } }), context)).status).toBe(409);
    expect((await apply(req({ kind: "course", stableId: "stern:MISSING 1", changes: { title: "Reviewed" } }), context)).status).toBe(409);
    expect(stubs.apply).not.toHaveBeenCalled();
  });
});
