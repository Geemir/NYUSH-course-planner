"use client";

import { createContext, useMemo } from "react";
import { useCourseData } from "@/hooks/useCourseData";
import {
  derivePlan,
  type PlanDerivationInput,
  type PlanDerivedValue,
} from "@/lib/derivePlan";
import { HOME_SITE, SITES } from "@/lib/clientReferenceData";
import { activeProgramIds } from "@/lib/programProfile";
import { usePlannerStore } from "@/store/plannerStore";

const SITE_NAMES = new Map(SITES.map((site) => [site.id, site.name]));

export interface PlanDerivedContextValue {
  input: PlanDerivationInput;
  derived: PlanDerivedValue;
}

export const PlanDerivedContext = createContext<PlanDerivedContextValue | null>(
  null,
);

export function PlanDerivedProvider({ children }: { children: React.ReactNode }) {
  const placements = usePlannerStore((state) => state.placements);
  const studyAway = usePlannerStore((state) => state.studyAway);
  const completedSemesters = usePlannerStore(
    (state) => state.completedSemesters,
  );
  const programProfile = usePlannerStore((state) => state.programProfile);
  const activePrograms = useMemo(() => activeProgramIds(programProfile), [programProfile]);
  const fulfillmentFacts = usePlannerStore((state) => state.fulfillmentFacts);
  const dismissedWarningIds = usePlannerStore(
    (state) => state.dismissedWarnings,
  );
  const {
    coursesById: baseCoursesById,
    courseByStableId,
    customIds,
    programs,
    rules,
  } = useCourseData();

  // Codes shared by multiple Bulletin sources are excluded from the code-keyed
  // map (they're ambiguous). Overlay the specific record each placement
  // resolved to via its stable id so a placed cross-source course still carries
  // credits, prereqs, offerings, and sites into every engine.
  const coursesById = useMemo(() => {
    const map = new Map(baseCoursesById);
    for (const placement of placements) {
      const stableId = placement.catalogCourseId;
      if (!stableId || map.has(placement.courseId)) continue;
      const course = courseByStableId.get(stableId);
      if (course) map.set(placement.courseId, course);
    }
    return map;
  }, [baseCoursesById, courseByStableId, placements]);

  const input = useMemo<PlanDerivationInput>(
    () => ({
      placements,
      studyAway,
      completedSemesters,
      activePrograms,
      fulfillmentFacts,
      dismissedWarningIds,
      coursesById,
      customIds,
      specialRules: rules,
      programs,
      homeSiteId: HOME_SITE.id,
      siteNameById: SITE_NAMES,
    }),
    [
      activePrograms,
      completedSemesters,
      coursesById,
      customIds,
      dismissedWarningIds,
      fulfillmentFacts,
      placements,
      programs,
      rules,
      studyAway,
    ],
  );
  const derived = useMemo(() => derivePlan(input), [input]);
  const value = useMemo(() => ({ input, derived }), [derived, input]);

  return (
    <PlanDerivedContext.Provider value={value}>
      {children}
    </PlanDerivedContext.Provider>
  );
}
