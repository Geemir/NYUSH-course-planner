"use client";

import { createContext, useMemo } from "react";
import { useCourseData } from "@/hooks/useCourseData";
import {
  derivePlan,
  type PlanDerivationInput,
  type PlanDerivedValue,
} from "@/lib/derivePlan";
import { HOME_SITE, SITES } from "@/lib/clientReferenceData";
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
  const activePrograms = usePlannerStore((state) => state.activePrograms);
  const fulfillmentFacts = usePlannerStore((state) => state.fulfillmentFacts);
  const dismissedWarningIds = usePlannerStore(
    (state) => state.dismissedWarnings,
  );
  const { coursesById, customIds, programs, rules } = useCourseData();

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
