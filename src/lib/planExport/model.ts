import { placementCredits } from "@/lib/credits";
import type { PlanDerivedValue } from "@/lib/derivePlan";
import { SITES_BY_ID } from "@/lib/clientReferenceData";
import {
  SEMESTER_IDS,
  semesterTermName,
  semesterYear,
  type Grade,
  type PlanPlacementV2,
  type PlanSnapshotV2,
  type SemesterId,
} from "@/lib/types";

export type ExportProgramRole = "core" | "primary-major" | "second-major" | "minor";

export interface ExportCourse {
  code: string;
  title: string;
  credits: number;
  expectedGrade: Grade | null;
  allocations: string[];
  resolved: boolean;
}

export interface ExportSemester {
  id: SemesterId;
  academicYear: string;
  term: string;
  site: string;
  completed: boolean;
  credits: number;
  courses: ExportCourse[];
}

export interface ExportRequirement {
  programId: string;
  programRole: ExportProgramRole;
  programName: string;
  categoryId: string;
  categoryName: string;
  unitKind: "courses" | "credits";
  required: number;
  planned: number;
  completed: number;
  status: "complete" | "planned" | "missing";
  statusSource: "calculated" | "manual";
  manualStatus: "planned" | "completed" | null;
  gapSummary: string;
}

export interface ExportWarning {
  severity: "error" | "warning";
  kind: string;
  message: string;
  courseCode: string | null;
  semesterId: SemesterId | null;
}

export interface PlanExportModel {
  generatedAt: string;
  catalogReleaseId: string | null;
  startYear: number;
  classYear: number;
  profile: Array<{ role: ExportProgramRole; id: string; name: string }>;
  credits: { required: number; planned: number; completed: number };
  semesters: ExportSemester[];
  requirements: ExportRequirement[];
  warnings: ExportWarning[];
  disclaimer: string;
}

const DISCLAIMER =
  "This export is planning guidance based on published Bulletin requirements. Confirm degree progress and course choices with your academic advisor.";

function academicYear(id: SemesterId, startYear: number): string {
  const firstYear = startYear + semesterYear(id) - 1;
  return `${firstYear}\u2013${String(firstYear + 1).slice(-2)}`;
}

function profileEntries(snapshot: PlanSnapshotV2): Array<{ role: ExportProgramRole; id: string }> {
  return [
    { role: "core", id: snapshot.programProfile.coreProgramId },
    { role: "primary-major", id: snapshot.programProfile.primaryMajorId },
    ...(snapshot.programProfile.secondMajorId
      ? [{ role: "second-major" as const, id: snapshot.programProfile.secondMajorId }]
      : []),
    ...snapshot.programProfile.minorIds.map((id) => ({ role: "minor" as const, id })),
  ];
}

export function buildPlanExportModel(
  snapshot: PlanSnapshotV2,
  derived: PlanDerivedValue,
  now: Date = new Date(),
): PlanExportModel {
  const programsById = new Map(derived.activeProgramObjs.map((program) => [program.id, program]));
  const profile = profileEntries(snapshot).map((item) => ({
    ...item,
    name: programsById.get(item.id)?.name ?? item.id,
  }));
  const roleByProgram = new Map(profile.map((item) => [item.id, item.role]));
  const categoryNames = new Map(
    derived.activeProgramObjs.flatMap((program) =>
      program.categories.map((category) => [
        `${program.id}/${category.id}`,
        `${program.name} / ${category.name}`,
      ] as const),
    ),
  );

  const semesters = SEMESTER_IDS.map<ExportSemester>((id) => {
    const siteId = snapshot.studyAway[id] ?? "shanghai";
    const courses = (derived.placementsBySemester.get(id) ?? []).map<ExportCourse>((placement) => {
      const course = derived.coursesById.get(placement.courseId);
      const titleSnapshot = (placement as Partial<PlanPlacementV2>).titleSnapshot;
      return {
        code: placement.courseId,
        title: course?.title ?? titleSnapshot ?? placement.courseId,
        credits: course ? placementCredits(placement, course) : placement.selectedCredits ?? 0,
        expectedGrade: placement.expectedGrade ?? null,
        allocations: (derived.allocation.effective.get(placement.courseId) ?? []).map(
          (allocation) =>
            categoryNames.get(`${allocation.programId}/${allocation.categoryId}`) ??
            `${allocation.programId} / ${allocation.categoryId}`,
        ),
        resolved: Boolean(course),
      };
    });
    return {
      id,
      academicYear: academicYear(id, snapshot.startYear),
      term: semesterTermName(id, snapshot.startYear),
      site: SITES_BY_ID.get(siteId)?.name ?? siteId,
      completed: snapshot.completedSemesters.includes(id),
      credits: derived.creditsBySemester.get(id) ?? 0,
      courses,
    };
  });

  const requirements = derived.progress.programs.flatMap<ExportRequirement>((programProgress) => {
    const program = programsById.get(programProgress.programId);
    const programName = program?.name ?? programProgress.programId;
    const programRole = roleByProgram.get(programProgress.programId) ?? "minor";
    return programProgress.categories.map((category) => {
      const gaps = [
        ...category.missingCourseIds,
        ...category.gaps.map((gap) =>
          gap.kind === "ambiguous"
            ? `${gap.label}: ${gap.candidateCourseIds.join(", ")}`
            : gap.label,
        ),
      ];
      const status = category.manualStatus === "completed"
        ? "complete"
        : category.manualStatus === "planned"
          ? "planned"
          : category.completedUnits >= category.requiredUnits
            ? "complete"
            : category.plannedUnits >= category.requiredUnits
              ? "planned"
              : "missing";
      return {
        programId: programProgress.programId,
        programRole,
        programName,
        categoryId: category.categoryId,
        categoryName: category.name,
        unitKind: category.unitKind,
        required: category.requiredUnits,
        planned: category.plannedUnits,
        completed: category.completedUnits,
        status,
        statusSource: category.manualStatus ? "manual" : "calculated",
        manualStatus: category.manualStatus,
        gapSummary: gaps.join("; "),
      };
    });
  });

  return {
    generatedAt: now.toISOString(),
    catalogReleaseId: snapshot.catalogReleaseId,
    startYear: snapshot.startYear,
    classYear: snapshot.startYear + 4,
    profile,
    credits: {
      required: derived.progress.credits.goal,
      planned: derived.progress.credits.planned,
      completed: derived.progress.credits.completed,
    },
    semesters,
    requirements,
    warnings: derived.warnings.map((warning) => ({
      severity: warning.severity,
      kind: warning.kind,
      message: warning.message,
      courseCode: warning.courseId ?? null,
      semesterId: warning.semesterId ?? null,
    })),
    disclaimer: DISCLAIMER,
  };
}

export function planExportFilename(
  model: Pick<PlanExportModel, "startYear">,
  extension: "json" | "xlsx" | "pdf",
): string {
  return `nyush-degree-plan-${model.startYear}.${extension}`;
}
