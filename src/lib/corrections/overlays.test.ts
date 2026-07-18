import { describe, expect, it } from "vitest";
import type { CatalogOverlayRow } from "@/db/schema";
import { applyCourseOverlays, applyProgramOverlays, OverlayCarryForwardError, reconcileCatalogOverlays } from "@/lib/corrections/overlays";
import type { CorrectionOverlayInput } from "@/lib/corrections/policy";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import type { CatalogProgram } from "@/lib/types";

const record: CatalogCourseRecord = {
  stableId: "stern:TEST-UA 1", sourceId: "stern", sourceSnapshotId: "snapshot", code: "TEST-UA 1", subject: "TEST-UA", level: "undergraduate", catalogOfferingTerms: ["Fall"], catalogOfferingText: "Fall", crossListedStableIds: [], reviewedOverlayIds: [], overlayProvenance: [],
  course: { id: "TEST-UA 1", title: "Original", credits: 4, department: "TEST-UA", description: "Source description", prereqs: [], sourceReferenceIds: [], offered: [], offeringKnown: false, sites: ["newyork"], fulfills: [], equivalentTo: [], attributes: [], tags: [] },
};
const overlay = (id: string, patchData: CorrectionOverlayInput, appliedAt = new Date("2026-07-18T00:00:00Z"), status: "active" | "superseded" = "active"): CatalogOverlayRow => ({ id, requestId: `request-${id}`, targetKind: patchData.kind, targetKey: "target", patchType: patchData.kind, patchData, sourceReleaseId: "release", status, appliedBy: "admin", appliedAt, supersededAt: status === "superseded" ? appliedAt : null, createdAt: appliedAt });

describe("reviewed overlay composition", () => {
  it("applies allowlisted course fields deterministically without mutating source truth", () => {
    const source = structuredClone(record);
    const result = applyCourseOverlays(record, [
      overlay("later", { kind: "course", stableId: record.stableId, changes: { title: "Later title", attributes: ["reviewed"] } }, new Date("2026-07-19")),
      overlay("earlier", { kind: "course", stableId: record.stableId, changes: { title: "Earlier title", description: "Reviewed description", minCredits: 2, maxCredits: 4, prerequisiteText: "Reviewed prerequisite", crossListedStableIds: ["stern:TEST-UA 2"] } }),
    ]);
    expect(result.value.course).toMatchObject({ title: "Later title", description: "Reviewed description", minCredits: 2, maxCredits: 4, prerequisiteText: "Reviewed prerequisite", attributes: ["reviewed"] });
    expect(result.value.crossListedStableIds).toEqual(["stern:TEST-UA 2"]);
    expect(result.appliedOverlayIds).toEqual(["earlier", "later"]);
    expect(record).toEqual(source);
  });

  it("adds/removes reviewed NYUSH fulfillment mappings and ignores stale/superseded overlays", () => {
    const added = applyCourseOverlays(record, [
      overlay("wrong", { kind: "course", stableId: "other", changes: { title: "Wrong" } }),
      overlay("superseded", { kind: "course", stableId: record.stableId, changes: { title: "Old" } }, new Date(), "superseded"),
      overlay("mapping", { kind: "requirement", programId: "cs", requirementId: "elective", action: "add_fulfillment", courseStableId: record.stableId }),
    ]);
    expect(added.value.course.fulfills).toEqual([{ programId: "cs", categoryId: "elective" }]);
    expect(added.appliedOverlayIds).toEqual(["mapping"]);
    const removed = applyCourseOverlays(added.value, [overlay("remove", { kind: "requirement", programId: "cs", requirementId: "elective", action: "remove_fulfillment", courseStableId: record.stableId })]);
    expect(removed.value.course.fulfills).toEqual([]);
  });

  it("adds only fully validated reviewed program records and notes", () => {
    const core: CatalogProgram = { id: "core", name: "Core", shortName: "Core", type: "core", categories: [], requirementRows: [], sourceRows: [], sourceReferenceIds: [], provenance: { sourceUrl: "https://bulletins.nyu.edu/", snapshotId: "s", sourceHash: "h" }, auditAuthority: "nyush-bulletin", eligibleProfileRoles: ["core"], reviewedOverlayIds: [], reviewedNotes: [] };
    const reviewed: CatalogProgram = { id: "reviewed-minor", name: "Reviewed Minor", shortName: "Minor", type: "minor", categories: [{ id: "req", name: "Requirement", requirement: { kind: "course", courseId: "TEST-UA 1" }, sourceUrl: "https://bulletins.nyu.edu/", sourceTableId: "table", sourceRowIndexes: [0] }], requirementRows: [], sourceRows: [], sourceReferenceIds: ["https://bulletins.nyu.edu/"], provenance: { sourceUrl: "https://bulletins.nyu.edu/", snapshotId: "overlay", sourceHash: "hash" }, auditAuthority: "reviewed-nyush-overlay", eligibleProfileRoles: ["minor"], reviewedOverlayIds: [], reviewedNotes: [] };
    const result = applyProgramOverlays([core], [
      overlay("note", { kind: "program-note", programId: "core", note: "Reviewed explanation", sourceUrl: "https://bulletins.nyu.edu/" }),
      overlay("program", { kind: "reviewed-program", program: reviewed }),
    ]);
    expect(result.value.find((program) => program.id === "core")?.reviewedNotes?.[0].note).toBe("Reviewed explanation");
    expect(result.value.find((program) => program.id === "reviewed-minor")).toMatchObject({ auditAuthority: "reviewed-nyush-overlay", eligibleProfileRoles: ["minor"] });
  });

  it("supersedes source-resolved patches and carries still-needed patches", () => {
    const resolvedSource = { ...record, course: { ...record.course, title: "Official correction" } };
    const result = reconcileCatalogOverlays([resolvedSource], [], [
      overlay("resolved", { kind: "course", stableId: record.stableId, changes: { title: "Official correction" } }),
      overlay("carry", { kind: "course", stableId: record.stableId, changes: { description: "Reviewed correction" } }),
    ]);
    expect(result.supersededOverlayIds).toEqual(["resolved"]);
  });

  it("blocks release carry-forward when a reviewed target disappears", () => {
    expect(() => reconcileCatalogOverlays([], [], [
      overlay("stale", { kind: "course", stableId: record.stableId, changes: { title: "Correction" } }),
    ])).toThrow(OverlayCarryForwardError);
  });
});
