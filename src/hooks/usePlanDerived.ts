"use client";

import { useMemo } from "react";
import { useCatalog } from "@/components/CatalogProvider";
import { useCourseData } from "@/hooks/useCourseData";
import { resolveAllocations } from "@/lib/allocation";
import { selectActiveCatalogPrograms } from "@/lib/catalogClient";
import { HOME_SITE, SITES } from "@/lib/data";
import { analyzeFeasibility } from "@/lib/feasibility";
import { computeProgress } from "@/lib/progress";
import { buildRuleContext } from "@/lib/rules";
import { placementCredits } from "@/lib/credits";
import {
  Placement,
  PlanWarning,
  ProgramProgress,
  SemesterId,
} from "@/lib/types";
import { computeWarnings } from "@/lib/validation";
import { usePlannerStore } from "@/store/plannerStore";

const SITE_NAMES = new Map(SITES.map((s) => [s.id, s.name]));

/**
 * Single source for everything computed from the plan: allocations,
 * warnings, progress, and per-semester/per-course lookups for the UI.
 */
export function usePlanDerived() {
  const placements = usePlannerStore((s) => s.placements);
  const studyAway = usePlannerStore((s) => s.studyAway);
  const completedSemesters = usePlannerStore((s) => s.completedSemesters);
  const activePrograms = usePlannerStore((s) => s.activePrograms);
  const fulfillmentFacts = usePlannerStore((s) => s.fulfillmentFacts);
  const dismissedIds = usePlannerStore((s) => s.dismissedWarnings);
  const { coursesById, customIds } = useCourseData();
  const { rules: specialRules, programs } = useCatalog();

  return useMemo(() => {
    const ruleCtx = buildRuleContext({
      rules: specialRules,
      placements,
      coursesById,
    });

    const programsById = new Map(programs.map((program) => [program.id, program]));
    const allocation = resolveAllocations({
      placements,
      coursesById,
      programsById,
      activePrograms,
    });

    const activeProgramObjs = selectActiveCatalogPrograms(programs, activePrograms);

    const progress = computeProgress({
      placements,
      completedSemesters,
      coursesById,
      programs: activeProgramObjs,
      effective: allocation.effective,
      fulfillmentFacts,
      rules: ruleCtx,
    });

    const allWarnings = computeWarnings({
      placements,
      studyAway,
      coursesById,
      homeSiteId: HOME_SITE.id,
      siteNameById: SITE_NAMES,
      budget: allocation.budget,
      doubleCounted: allocation.doubleCounted,
      rules: ruleCtx,
    });

    // Acknowledged warnings stay out of chips/tooltips/the main list, but
    // remain restorable while the underlying condition persists.
    const dismissedSet = new Set(dismissedIds);
    const warnings = allWarnings.filter((w) => !dismissedSet.has(w.id));
    const dismissedWarnings = allWarnings.filter((w) => dismissedSet.has(w.id));

    const warningsByCourse = new Map<string, PlanWarning[]>();
    const warningsBySemester = new Map<SemesterId, PlanWarning[]>();
    for (const w of warnings) {
      if (w.courseId) {
        warningsByCourse.set(w.courseId, [
          ...(warningsByCourse.get(w.courseId) ?? []),
          w,
        ]);
      } else if (w.semesterId) {
        warningsBySemester.set(w.semesterId, [
          ...(warningsBySemester.get(w.semesterId) ?? []),
          w,
        ]);
      }
    }

    const placementsBySemester = new Map<SemesterId, Placement[]>();
    const placementByCourse = new Map<string, Placement>();
    const creditsBySemester = new Map<SemesterId, number>();
    for (const p of placements) {
      placementsBySemester.set(p.semesterId, [
        ...(placementsBySemester.get(p.semesterId) ?? []),
        p,
      ]);
      placementByCourse.set(p.courseId, p);
      creditsBySemester.set(
        p.semesterId,
        (creditsBySemester.get(p.semesterId) ?? 0) +
          (coursesById.has(p.courseId)
            ? placementCredits(p, coursesById.get(p.courseId)!)
            : 0),
      );
    }

    const progressByProgram = new Map<string, ProgramProgress>(
      progress.programs.map((p) => [p.programId, p]),
    );

    const feasibility = analyzeFeasibility({
      programs: activeProgramObjs,
      progressByProgram,
      placements,
      completedSemesters,
      studyAway,
      coursesById,
      homeSiteId: HOME_SITE.id,
      rules: ruleCtx,
    });

    /** Major program ids a placed course currently counts toward. */
    const effectiveMajors = (courseId: string): string[] =>
      (allocation.effective.get(courseId) ?? [])
        .filter((f) => programsById.get(f.programId)?.type === "major")
        .map((f) => f.programId);

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
      creditsBySemester,
      activeProgramObjs,
      effectiveMajors,
      coursesById,
      customIds,
      specialRules,
      feasibility,
    };
  }, [placements, studyAway, completedSemesters, activePrograms, fulfillmentFacts, dismissedIds, coursesById, customIds, specialRules, programs]);
}
