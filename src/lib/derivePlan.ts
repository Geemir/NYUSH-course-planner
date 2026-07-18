import { placementCredits } from "@/lib/credits";
import { resolveAllocations, type AllocationResult } from "@/lib/allocation";
import {
  selectActiveCatalogPrograms,
  type ClientPlannerProgram,
} from "@/lib/catalogClient";
import { analyzeFeasibility, type FeasibilityReport } from "@/lib/feasibility";
import { computeProgress, type ProgressResult } from "@/lib/progress";
import type { PlannerProgram } from "@/lib/requirements";
import { buildRuleContext, type RuleContext } from "@/lib/rules";
import type {
  Course,
  FulfillmentFact,
  Placement,
  PlanWarning,
  ProgramProgress,
  SemesterId,
  SpecialRule,
} from "@/lib/types";
import { computeWarnings } from "@/lib/validation";

export interface PlanDerivationInput {
  placements: Placement[];
  studyAway: Partial<Record<SemesterId, string>>;
  completedSemesters: SemesterId[];
  activePrograms: string[];
  fulfillmentFacts: FulfillmentFact[];
  dismissedWarningIds: string[];
  coursesById: Map<string, Course>;
  customIds: Set<string>;
  specialRules: SpecialRule[];
  programs: PlannerProgram[];
  homeSiteId: string;
  siteNameById: Map<string, string>;
}

export interface PlanDerivedValue {
  allocation: AllocationResult;
  progress: ProgressResult;
  progressByProgram: Map<string, ProgramProgress>;
  warnings: PlanWarning[];
  dismissedWarnings: PlanWarning[];
  warningsByCourse: Map<string, PlanWarning[]>;
  warningsBySemester: Map<SemesterId, PlanWarning[]>;
  placementsBySemester: Map<SemesterId, Placement[]>;
  placementByCourse: Map<string, Placement>;
  placementById: Map<string, Placement>;
  placementByCatalogId: Map<string, Placement>;
  placementByCustomCourse: Map<string, Placement>;
  creditsBySemester: Map<SemesterId, number>;
  activeProgramObjs: ClientPlannerProgram[];
  effectiveMajors: (courseId: string) => string[];
  coursesById: Map<string, Course>;
  customIds: Set<string>;
  specialRules: SpecialRule[];
  ruleContext: RuleContext;
}

export function derivePlan(input: PlanDerivationInput): PlanDerivedValue {
  const ruleContext = buildRuleContext({
    rules: input.specialRules,
    placements: input.placements,
    coursesById: input.coursesById,
  });
  const programsById = new Map(
    input.programs.map((program) => [program.id, program]),
  );
  const allocation = resolveAllocations({
    placements: input.placements,
    coursesById: input.coursesById,
    programsById,
    activePrograms: input.activePrograms,
  });
  const activeProgramObjs = selectActiveCatalogPrograms(
    input.programs,
    input.activePrograms,
  );
  const progress = computeProgress({
    placements: input.placements,
    completedSemesters: input.completedSemesters,
    coursesById: input.coursesById,
    programs: activeProgramObjs,
    effective: allocation.effective,
    fulfillmentFacts: input.fulfillmentFacts,
    rules: ruleContext,
  });
  const allWarnings = computeWarnings({
    placements: input.placements,
    studyAway: input.studyAway,
    coursesById: input.coursesById,
    homeSiteId: input.homeSiteId,
    siteNameById: input.siteNameById,
    budget: allocation.budget,
    doubleCounted: allocation.doubleCounted,
    rules: ruleContext,
  });

  const dismissedSet = new Set(input.dismissedWarningIds);
  const warnings = allWarnings.filter((warning) => !dismissedSet.has(warning.id));
  const dismissedWarnings = allWarnings.filter((warning) =>
    dismissedSet.has(warning.id),
  );
  const warningsByCourse = new Map<string, PlanWarning[]>();
  const warningsBySemester = new Map<SemesterId, PlanWarning[]>();
  for (const warning of warnings) {
    if (warning.courseId) {
      warningsByCourse.set(warning.courseId, [
        ...(warningsByCourse.get(warning.courseId) ?? []),
        warning,
      ]);
    } else if (warning.semesterId) {
      warningsBySemester.set(warning.semesterId, [
        ...(warningsBySemester.get(warning.semesterId) ?? []),
        warning,
      ]);
    }
  }

  const placementsBySemester = new Map<SemesterId, Placement[]>();
  const placementByCourse = new Map<string, Placement>();
  const placementById = new Map<string, Placement>();
  const placementByCatalogId = new Map<string, Placement>();
  const placementByCustomCourse = new Map<string, Placement>();
  const creditsBySemester = new Map<SemesterId, number>();
  for (const placement of input.placements) {
    placementsBySemester.set(placement.semesterId, [
      ...(placementsBySemester.get(placement.semesterId) ?? []),
      placement,
    ]);
    placementByCourse.set(placement.courseId, placement);
    if ("placementId" in placement && typeof placement.placementId === "string") {
      placementById.set(placement.placementId, placement);
    }
    if ("catalogCourseId" in placement && typeof placement.catalogCourseId === "string") {
      placementByCatalogId.set(placement.catalogCourseId, placement);
    } else {
      placementByCustomCourse.set(placement.courseId, placement);
    }
    const course = input.coursesById.get(placement.courseId);
    creditsBySemester.set(
      placement.semesterId,
      (creditsBySemester.get(placement.semesterId) ?? 0) +
        (course ? placementCredits(placement, course) : 0),
    );
  }

  const progressByProgram = new Map<string, ProgramProgress>(
    progress.programs.map((program) => [program.programId, program]),
  );
  const effectiveMajors = (courseId: string): string[] =>
    (allocation.effective.get(courseId) ?? [])
      .filter((fulfillment) => programsById.get(fulfillment.programId)?.type === "major")
      .map((fulfillment) => fulfillment.programId);

  return {
    allocation,
    progress,
    progressByProgram,
    warnings,
    dismissedWarnings,
    warningsByCourse,
    warningsBySemester,
    placementsBySemester,
    placementByCourse,
    placementById,
    placementByCatalogId,
    placementByCustomCourse,
    creditsBySemester,
    activeProgramObjs,
    effectiveMajors,
    coursesById: input.coursesById,
    customIds: input.customIds,
    specialRules: input.specialRules,
    ruleContext,
  };
}

export function deriveFeasibility(
  input: PlanDerivationInput,
  derived: PlanDerivedValue,
): FeasibilityReport {
  return analyzeFeasibility({
    programs: derived.activeProgramObjs,
    progressByProgram: derived.progressByProgram,
    placements: input.placements,
    completedSemesters: input.completedSemesters,
    studyAway: input.studyAway,
    coursesById: input.coursesById,
    homeSiteId: input.homeSiteId,
    rules: derived.ruleContext,
  });
}
