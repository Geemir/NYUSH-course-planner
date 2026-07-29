import type { CatalogBootstrapResponse } from "@/lib/catalog/contracts";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import { exportPlan, parsePlanDocument } from "@/lib/planIO";
import {
  ProgramProfileSchema,
  validateProgramProfile,
  type ProgramProfile,
} from "@/lib/programProfile";
import type {
  PlanPlacementV2,
  PlanSnapshotV1,
  PlanSnapshotV2,
} from "@/lib/types";

export const PLAN_V1_BACKUP_KEY = "nyush-planner-v1-backup";
export const PLAN_V2_STORAGE_KEY = "nyush-planner-v2";

export interface PlanMigrationIssue {
  code:
    | "confirm-double-major"
    | "missing-core"
    | "missing-primary-major"
    | "too-many-majors"
    | "duplicate-program"
    | "unresolved-program"
    | "invalid-profile"
    | "ambiguous-course"
    | "unresolved-course";
  message: string;
  value?: string;
  blocking: boolean;
}

export interface PlanMigrationResult {
  snapshot: PlanSnapshotV2;
  status: "ready" | "needs-resolution";
  issues: PlanMigrationIssue[];
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function activeRecords(
  bootstrap: CatalogBootstrapResponse,
  records: CatalogCourseRecord[],
): CatalogCourseRecord[] {
  return records.filter(
    (record) =>
      bootstrap.release.sourceSnapshotIds[record.sourceId] ===
      record.sourceSnapshotId,
  );
}

function profileFromV1(
  input: PlanSnapshotV1,
  bootstrap: CatalogBootstrapResponse,
): { profile: ProgramProfile; unresolved: string[]; issues: PlanMigrationIssue[] } {
  const byId = new Map(bootstrap.programs.map((program) => [program.id, program]));
  const known = input.activePrograms.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
  const cores = known.filter((program) => program.type === "core");
  const majors = known.filter((program) => program.type === "major");
  const minors = known.filter((program) => program.type === "minor");
  const unknown = input.activePrograms.filter((id) => !byId.has(id));
  const duplicates = input.activePrograms.filter((id, index, all) => all.indexOf(id) !== index);
  const issues: PlanMigrationIssue[] = [];
  const unresolved = [...unknown, ...duplicates, ...majors.slice(2).map((program) => program.id)];

  if (cores.length !== 1) issues.push({ code: "missing-core", message: "Select the NYUSH Core program.", blocking: true });
  if (majors.length === 0) issues.push({ code: "missing-primary-major", message: "Select a primary NYUSH major.", blocking: true });
  if (majors.length === 2) issues.push({ code: "confirm-double-major", message: "Confirm the primary and second major order.", blocking: false });
  if (majors.length > 2) issues.push({ code: "too-many-majors", message: "Classify the additional major selections.", blocking: true });
  duplicates.forEach((id) => issues.push({ code: "duplicate-program", value: id, message: `${id} appears more than once.`, blocking: true }));
  unknown.forEach((id) => issues.push({ code: "unresolved-program", value: id, message: `${id} is not in the active catalog.`, blocking: true }));

  const fallbackCore = bootstrap.programs.find((program) => program.type === "core")?.id ?? "needs-core";
  const profile = ProgramProfileSchema.parse({
    coreProgramId: cores[0]?.id ?? fallbackCore,
    primaryMajorId: majors[0]?.id ?? "needs-primary-major",
    secondMajorId: majors[1]?.id ?? null,
    minorIds: minors.map((program) => program.id),
  });
  const validation = validateProgramProfile(profile, bootstrap.programs);
  validation.issues.forEach((issue) => issues.push({
    code: "invalid-profile",
    value: issue.programId ?? undefined,
    message: issue.message,
    blocking: true,
  }));
  return { profile: validation.normalized, unresolved, issues };
}

export function migratePlanV1(
  input: PlanSnapshotV1,
  bootstrap: CatalogBootstrapResponse,
  cachedCourses: CatalogCourseRecord[],
): PlanMigrationResult {
  const records = activeRecords(bootstrap, cachedCourses);
  const profile = profileFromV1(input, bootstrap);
  const issues = [...profile.issues];
  const fingerprint = shortHash(canonical(input));
  const placements: PlanPlacementV2[] = input.placements.map((placement, index) => {
    const matches = records.filter((record) => record.code === placement.courseId);
    const custom = input.customCourses.find((course) => course.id === placement.courseId);
    if (matches.length > 1) issues.push({ code: "ambiguous-course", value: placement.courseId, message: `${placement.courseId} exists in multiple Bulletin sources.`, blocking: true });
    if (matches.length === 0 && !custom) issues.push({ code: "unresolved-course", value: placement.courseId, message: `${placement.courseId} is not cached yet.`, blocking: false });
    return {
      ...placement,
      placementId: `legacy-${shortHash(`${fingerprint}:${index}:${placement.courseId}:${placement.semesterId}`)}`,
      ...(matches.length === 1 ? { catalogCourseId: matches[0].stableId } : {}),
      titleSnapshot: (matches[0]?.course.title ?? custom?.title ?? placement.courseId).slice(0, 200),
    };
  });
  const snapshot: PlanSnapshotV2 = {
    version: 2,
    catalogReleaseId: bootstrap.release.id,
    placements,
    studyAway: { ...input.studyAway },
    completedSemesters: [...input.completedSemesters],
    programProfile: profile.profile,
    unresolvedProgramIds: profile.unresolved,
    customCourses: [...input.customCourses],
    fulfillmentFacts: [...(input.fulfillmentFacts ?? [])],
    requirementStatusOverrides: [],
    dismissedWarnings: [...input.dismissedWarnings],
    startYear: input.startYear,
  };
  return {
    snapshot,
    status: issues.some((issue) => issue.blocking) ? "needs-resolution" : "ready",
    issues,
  };
}

export function reconcilePlanV2(
  input: PlanSnapshotV2,
  bootstrap: CatalogBootstrapResponse,
  cachedCourses: CatalogCourseRecord[],
): PlanMigrationResult {
  const records = activeRecords(bootstrap, cachedCourses);
  const issues: PlanMigrationIssue[] = [];
  const profile = validateProgramProfile(input.programProfile, bootstrap.programs);
  profile.issues.forEach((issue) => issues.push({ code: "invalid-profile", value: issue.programId ?? undefined, message: issue.message, blocking: true }));
  const activeIds = new Set(records.map((record) => record.stableId));
  const customIds = new Set(input.customCourses.map((course) => course.id));
  const placements = input.placements.map((placement) => {
    if (placement.catalogCourseId && activeIds.has(placement.catalogCourseId)) return placement;
    const matches = records.filter((record) => record.code === placement.courseId);
    if (matches.length === 1) return { ...placement, catalogCourseId: matches[0].stableId, titleSnapshot: matches[0].course.title.slice(0, 200) };
    if (matches.length === 0 && customIds.has(placement.courseId)) {
      // A user-authored custom course legitimately has no catalog record.
      const { catalogCourseId: _retired, ...rest } = placement;
      void _retired;
      return rest;
    }
    issues.push({
      code: matches.length > 1 ? "ambiguous-course" : "unresolved-course",
      value: placement.courseId,
      message: matches.length > 1 ? `${placement.courseId} has multiple active sources.` : `${placement.courseId} is unavailable in this release.`,
      blocking: matches.length > 1,
    });
    const { catalogCourseId: _retired, ...rest } = placement;
    void _retired;
    return rest;
  });
  const snapshot: PlanSnapshotV2 = {
    ...input,
    requirementStatusOverrides: [...(input.requirementStatusOverrides ?? [])],
    catalogReleaseId: bootstrap.release.id,
    placements,
    programProfile: profile.normalized,
  };
  return { snapshot, status: issues.some((issue) => issue.blocking) ? "needs-resolution" : "ready", issues };
}

export function persistPlanMigration(
  originalV1Json: string,
  result: PlanMigrationResult,
  storage: Pick<Storage, "getItem" | "setItem">,
): void {
  const original = parsePlanDocument(originalV1Json);
  if (original.version !== 1) throw new Error("Only a v1 plan can create the migration backup.");
  if (result.status !== "ready") throw new Error("Plan migration still needs resolution.");
  const existing = storage.getItem(PLAN_V1_BACKUP_KEY);
  let validBackup = false;
  if (existing) {
    try {
      validBackup = parsePlanDocument(existing).version === 1;
    } catch {
      validBackup = false;
    }
  }
  if (!validBackup) storage.setItem(PLAN_V1_BACKUP_KEY, originalV1Json);
  storage.setItem(PLAN_V2_STORAGE_KEY, exportPlan(result.snapshot));
}
