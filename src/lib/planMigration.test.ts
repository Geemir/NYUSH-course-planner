import { describe, expect, it } from "vitest";
import type { CatalogBootstrapResponse } from "@/lib/catalog/contracts";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import {
  PLAN_V1_BACKUP_KEY,
  PLAN_V2_STORAGE_KEY,
  migratePlanV1,
  persistPlanMigration,
} from "@/lib/planMigration";
import type { CatalogProgram, PlanSnapshotV1 } from "@/lib/types";

function program(id: string, type: "core" | "major" | "minor"): CatalogProgram {
  return {
    id, name: id, shortName: id, type, categories: [], requirementRows: [], sourceRows: [],
    sourceReferenceIds: [],
    provenance: { sourceUrl: "https://bulletins.nyu.edu/undergraduate/shanghai/", snapshotId: "shanghai-snapshot", sourceHash: "hash" },
    auditAuthority: "nyush-bulletin",
    eligibleProfileRoles: type === "core" ? ["core"] : type === "minor" ? ["minor"] : ["primaryMajor", "secondMajor"],
  };
}

const bootstrap: CatalogBootstrapResponse = {
  release: { id: "release", sourceSnapshotIds: { "nyu-shanghai": "shanghai-snapshot", stern: "stern-snapshot" }, publishedAt: "2026-07-18T00:00:00.000Z" },
  programs: [program("core", "core"), program("cs", "major"), program("ds", "major"), program("ima", "major"), program("math-minor", "minor")],
  rules: [], sources: [], sites: [], filters: { subjects: [], catalogTerms: [], creditBounds: [0, 4] },
};

function course(sourceId: string, snapshot: string, code: string, title = code): CatalogCourseRecord {
  return {
    stableId: `${sourceId}:${code}`, sourceId, sourceSnapshotId: snapshot, code,
    subject: code.split(" ")[0], level: "undergraduate", catalogOfferingTerms: [],
    catalogOfferingText: null, crossListedStableIds: [],
    course: { id: code, title, credits: 4, department: code.split(" ")[0], prereqs: [],
      sourceReferenceIds: [], offered: [], offeringKnown: false, sites: [sourceId === "nyu-shanghai" ? "shanghai" : "newyork"],
      fulfills: [], equivalentTo: [], attributes: [], tags: [] },
  };
}

const base: PlanSnapshotV1 = {
  version: 1,
  placements: [{ courseId: "CSCI-SHU 101", semesterId: "Y1F", allocation: "auto", selectedCredits: 3 }],
  studyAway: { Y2F: "newyork" }, completedSemesters: ["Y1F"],
  activePrograms: ["core", "cs", "math-minor"],
  customCourses: [], fulfillmentFacts: [{ id: "fact", kind: "waiver", requirementId: "core/x", label: "Waiver" }],
  dismissedWarnings: ["warning"], startYear: 2025,
};

describe("plan migration", () => {
  it("maps one major and minors while preserving every plan field", () => {
    const result = migratePlanV1(base, bootstrap, [course("nyu-shanghai", "shanghai-snapshot", "CSCI-SHU 101", "Intro")]);
    expect(result.status).toBe("ready");
    expect(result.snapshot.programProfile).toEqual({ coreProgramId: "core", primaryMajorId: "cs", secondMajorId: null, minorIds: ["math-minor"] });
    expect(result.snapshot.placements[0]).toMatchObject({ courseId: "CSCI-SHU 101", catalogCourseId: "nyu-shanghai:CSCI-SHU 101", titleSnapshot: "Intro", selectedCredits: 3 });
    expect(result.snapshot).toMatchObject({ studyAway: base.studyAway, completedSemesters: base.completedSemesters, fulfillmentFacts: base.fulfillmentFacts, dismissedWarnings: base.dismissedWarnings, startYear: 2025 });
  });

  it("maps two majors in existing order and emits confirmation", () => {
    const result = migratePlanV1({ ...base, activePrograms: ["core", "ds", "cs"] }, bootstrap, []);
    expect(result.snapshot.programProfile).toMatchObject({ primaryMajorId: "ds", secondMajorId: "cs" });
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "confirm-double-major", blocking: false }));
  });

  it.each([
    [["core", "cs", "ds", "ima"], "too-many-majors"],
    [["core", "math-minor"], "missing-primary-major"],
    [["core", "cs", "cs"], "duplicate-program"],
    [["core", "cs", "unknown"], "unresolved-program"],
  ] as const)("requires resolution without dropping selections: %j", (activePrograms, issueCode) => {
    const ids = [...activePrograms] as string[];
    const result = migratePlanV1({ ...base, activePrograms: ids }, bootstrap, []);
    expect(result.status).toBe("needs-resolution");
    expect(result.issues).toContainEqual(expect.objectContaining({ code: issueCode }));
    ids.filter((id) => id === "unknown" || ids.indexOf(id) !== ids.lastIndexOf(id) || id === "ima").forEach((id) => expect(result.snapshot.unresolvedProgramIds).toContain(id));
  });

  it("never chooses between same-code cross-source records", () => {
    const result = migratePlanV1(base, bootstrap, [
      course("nyu-shanghai", "shanghai-snapshot", "CSCI-SHU 101"),
      course("stern", "stern-snapshot", "CSCI-SHU 101"),
    ]);
    expect(result.status).toBe("needs-resolution");
    expect(result.snapshot.placements[0].catalogCourseId).toBeUndefined();
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "ambiguous-course" }));
  });

  it("generates byte-identical placement IDs across repeated migrations", () => {
    const first = migratePlanV1(base, bootstrap, []).snapshot;
    const second = migratePlanV1(JSON.parse(JSON.stringify(base)), bootstrap, []).snapshot;
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("backs up valid v1 before v2 and never overwrites an existing valid backup", () => {
    const raw = JSON.stringify(base);
    const result = migratePlanV1(base, bootstrap, []);
    expect(result.status).toBe("ready");
    const values = new Map<string, string>([[PLAN_V1_BACKUP_KEY, JSON.stringify({ ...base, startYear: 2024 })]]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
    const existing = values.get(PLAN_V1_BACKUP_KEY);
    persistPlanMigration(raw, result, storage);
    expect(values.get(PLAN_V1_BACKUP_KEY)).toBe(existing);
    expect(JSON.parse(values.get(PLAN_V2_STORAGE_KEY)!)).toMatchObject({ version: 2, catalogReleaseId: "release" });
    expect(() => persistPlanMigration("corrupt", result, storage)).toThrow();
    expect(values.get(PLAN_V1_BACKUP_KEY)).toBe(existing);
  });
});
