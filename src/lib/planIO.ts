import { z } from "zod";
import { ProgramProfileSchema } from "@/lib/programProfile";
import {
  CourseSchema,
  FulfillmentFactsSchema,
  GradeSchema,
  SEMESTER_IDS,
  type Course,
  type PersistedPlanSnapshot,
  type PlanSnapshotV1,
  type PlanSnapshotV2,
  type SemesterId,
} from "@/lib/types";

const SemesterIdSchema = z.enum(SEMESTER_IDS);
const PlacementV1Schema = z.object({
  courseId: z.string().min(1),
  semesterId: SemesterIdSchema,
  allocation: z.string(),
  selectedCredits: z.number().nonnegative().max(18).optional(),
  expectedGrade: GradeSchema.optional(),
}).strict();
const PlacementV2Schema = PlacementV1Schema.extend({
  placementId: z.string().min(1),
  catalogCourseId: z.string().min(1).optional(),
  titleSnapshot: z.string().min(1).max(200).optional(),
}).strict();

function validatedCustomCourses(values: unknown[]): Course[] {
  return values.flatMap((value) => {
    const parsed = CourseSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}

const SharedSnapshotFields = {
  studyAway: z.record(z.string(), z.string()).optional().default({}),
  completedSemesters: z.array(SemesterIdSchema).optional().default([]),
  customCourses: z.array(z.unknown()).optional().default([]).transform(validatedCustomCourses),
  fulfillmentFacts: FulfillmentFactsSchema,
  dismissedWarnings: z.array(z.string()).optional().default([]),
  startYear: z.number().int().min(2015).max(2040).optional().default(2025),
};

export const PlanSnapshotV1Schema = z.object({
  version: z.literal(1),
  placements: z.array(PlacementV1Schema),
  activePrograms: z.array(z.string().min(1)),
  ...SharedSnapshotFields,
}).strict();

export const PlanSnapshotV2Schema = z.object({
  version: z.literal(2),
  catalogReleaseId: z.string().min(1).nullable(),
  placements: z.array(PlacementV2Schema),
  programProfile: ProgramProfileSchema,
  unresolvedProgramIds: z.array(z.string().min(1)),
  ...SharedSnapshotFields,
}).strict();

function normalizeStudyAway(
  value: Record<string, string>,
): Partial<Record<SemesterId, string>> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) =>
      (SEMESTER_IDS as readonly string[]).includes(key),
    ),
  ) as Partial<Record<SemesterId, string>>;
}

export function parsePlanDocument(text: string): PersistedPlanSnapshot {
  const raw: unknown = JSON.parse(text);
  const parsed = z.discriminatedUnion("version", [
    PlanSnapshotV1Schema,
    PlanSnapshotV2Schema,
  ]).parse(raw);
  return {
    ...parsed,
    studyAway: normalizeStudyAway(parsed.studyAway),
  } as PersistedPlanSnapshot;
}

/** Legacy boundary retained until the v2 store migration task is complete. */
export function parsePlan(text: string): PlanSnapshotV1 {
  const parsed = parsePlanDocument(text);
  if (parsed.version !== 1) throw new Error("This planner state has not migrated to plan v2 yet.");
  return parsed;
}

export function exportPlan(snapshot: PlanSnapshotV2): string {
  return JSON.stringify(PlanSnapshotV2Schema.parse(snapshot), null, 2);
}

export function downloadPlan(snapshot: PersistedPlanSnapshot) {
  const body = snapshot.version === 2
    ? exportPlan(snapshot)
    : JSON.stringify(PlanSnapshotV1Schema.parse(snapshot), null, 2);
  const blob = new Blob([body], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "nyush-plan.json";
  anchor.click();
  URL.revokeObjectURL(url);
}
