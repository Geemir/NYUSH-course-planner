import { describe, expect, it } from "vitest";
import type { CatalogOverlayRow } from "@/db/schema";
import { applyCourseOverlays, applyProgramOverlays, OverlayCarryForwardError, OverlayTrustError, reconcileCatalogOverlays } from "@/lib/corrections/overlays";
import type { CorrectionOverlayInput } from "@/lib/corrections/policy";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import type { CatalogProgram } from "@/lib/types";

const record: CatalogCourseRecord = {
  stableId: "stern:TEST-UA 1", sourceId: "stern", sourceSnapshotId: "snapshot", code: "TEST-UA 1", subject: "TEST-UA", level: "undergraduate", catalogOfferingTerms: ["Fall"], catalogOfferingText: "Fall", crossListedStableIds: [], reviewedOverlayIds: [], overlayProvenance: [],
  course: { id: "TEST-UA 1", title: "Original", credits: 4, department: "TEST-UA", description: "Source description", prereqs: [], sourceReferenceIds: [], offered: [], offeringKnown: false, sites: ["newyork"], fulfills: [], equivalentTo: [], attributes: [], tags: [] },
};
const overlay = (id: string, patchData: CorrectionOverlayInput, appliedAt = new Date("2026-07-18T00:00:00Z"), status: "active" | "superseded" = "active"): CatalogOverlayRow => ({ id, requestId: `request-${id}`, origin: "correction", reason: null, targetKind: patchData.kind, targetKey: "target", patchType: patchData.kind, patchData, sourceReleaseId: "release", status, appliedBy: "admin", appliedAt, supersededAt: status === "superseded" ? appliedAt : null, createdAt: appliedAt });

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

  it("applies offering edits and a course tombstone", () => {
    const edited = applyCourseOverlays(record, [
      overlay("terms", { kind: "course", stableId: record.stableId, changes: {
        catalogOfferingTerms: ["Spring"], catalogOfferingText: "Every spring",
        offered: ["spring"], offeringText: "Typically offered in spring", offeringKnown: true,
      } }),
    ]);
    expect(edited.value).toMatchObject({
      catalogOfferingTerms: ["Spring"], catalogOfferingText: "Every spring",
      course: { offered: ["spring"], offeringText: "Typically offered in spring", offeringKnown: true },
    });
    expect(applyCourseOverlays(record, [
      overlay("delete", { kind: "course-delete", stableId: record.stableId }),
    ]).deleted).toBe(true);
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

  it("upserts and deletes requirement categories without mutating Bulletin data", () => {
    const sourceUrl = "https://bulletins.nyu.edu/undergraduate/shanghai/core-curriculum/";
    const display = {
      schemaVersion: 2 as const,
      sourceUrl,
      sections: [{
        id: "curriculumtext",
        heading: "Curriculum",
        blocks: [{
          kind: "table" as const,
          id: "ipc-table",
          caption: null,
          headingTrail: [],
          rows: [{
            sourceIndex: 0,
            role: "course" as const,
            text: "IPC elective",
            creditsText: null,
            linkedCourseCodes: [],
            sourceAnchors: [],
            footnoteMarkers: [],
          }],
        }],
      }],
    };
    const core: CatalogProgram = { id: "core", name: "Core", shortName: "Core", type: "core", categories: [], bulletinDisplay: display, interpretations: [], requirementRows: [], sourceRows: [], sourceReferenceIds: [], provenance: { sourceUrl, snapshotId: "s", sourceHash: "h" }, auditAuthority: "nyush-bulletin", eligibleProfileRoles: ["core"], reviewedOverlayIds: [], reviewedNotes: [] };
    const category = { id: "ipc", name: "IPC", requirement: { kind: "choose" as const, count: 1, children: [{ kind: "attribute" as const, attribute: "IPC" }] }, sourceUrl, sourceTableId: "ipc-table", sourceRowIndexes: [0] };
    const added = applyProgramOverlays([core], [overlay("upsert", { kind: "requirement-upsert", programId: "core", category })]);
    expect(added.value[0].categories).toEqual([category]);
    expect(added.value[0].interpretations).toEqual([
      expect.objectContaining({
        id: "ipc",
        status: "verified",
        requirement: category.requirement,
        sourceTableIds: ["ipc-table"],
        sourceRowRefs: [{ tableId: "ipc-table", sourceIndex: 0 }],
      }),
    ]);
    expect(added.value[0].bulletinDisplay).toEqual(display);
    expect(core.categories).toEqual([]);
    const removed = applyProgramOverlays(added.value, [overlay("delete-category", { kind: "requirement-delete", programId: "core", categoryId: "ipc" })]);
    expect(removed.value[0].categories).toEqual([]);
    expect(removed.value[0].interpretations).toEqual([]);

    const orphan = { ...category, sourceTableId: "missing-table" };
    expect(() =>
      applyProgramOverlays([core], [
        overlay("orphan", {
          kind: "requirement-upsert",
          programId: "core",
          category: orphan,
        }),
      ]),
    ).toThrow(OverlayTrustError);
  });

  it("supersedes source-resolved patches and carries still-needed patches", () => {
    const resolvedSource = { ...record, course: { ...record.course, title: "Official correction" } };
    const result = reconcileCatalogOverlays([resolvedSource], [], [
      overlay("resolved", { kind: "course", stableId: record.stableId, changes: { title: "Official correction" } }),
      overlay("carry", { kind: "course", stableId: record.stableId, changes: { description: "Reviewed correction" } }),
    ]);
    expect(result.supersededOverlayIds).toEqual(["resolved"]);
  });

  it("reconciles direct tombstones and category overlays against new source truth", () => {
    const program: CatalogProgram = { id: "core", name: "Core", shortName: "Core", type: "core", categories: [], requirementRows: [], sourceRows: [], sourceReferenceIds: [], provenance: { sourceUrl: "https://bulletins.nyu.edu/", snapshotId: "s", sourceHash: "h" }, auditAuthority: "nyush-bulletin", eligibleProfileRoles: ["core"], reviewedOverlayIds: [], reviewedNotes: [] };
    const result = reconcileCatalogOverlays([], [program], [
      overlay("removed-at-source", { kind: "course-delete", stableId: record.stableId }),
      overlay("already-missing", { kind: "requirement-delete", programId: "core", categoryId: "retired" }),
    ]);
    expect(result.supersededOverlayIds).toEqual(["already-missing", "removed-at-source"]);
  });

  it("blocks release carry-forward when a reviewed target disappears", () => {
    expect(() => reconcileCatalogOverlays([], [], [
      overlay("stale", { kind: "course", stableId: record.stableId, changes: { title: "Correction" } }),
    ])).toThrow(OverlayCarryForwardError);
  });
});
