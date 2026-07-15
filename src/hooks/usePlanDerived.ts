"use client";

import { useContext, useMemo } from "react";
import { PlanDerivedContext } from "@/components/planner/PlanDerivedProvider";
import {
  deriveFeasibility,
  type PlanDerivedValue,
} from "@/lib/derivePlan";
import type { FeasibilityReport } from "@/lib/feasibility";

function usePlanDerivedContext() {
  const value = useContext(PlanDerivedContext);
  if (!value) {
    throw new Error("usePlanDerived requires PlanDerivedProvider");
  }
  return value;
}

export function usePlanDerived(): PlanDerivedValue {
  return usePlanDerivedContext().derived;
}

export function useFeasibility(): FeasibilityReport {
  const { input, derived } = usePlanDerivedContext();
  return useMemo(
    () => deriveFeasibility(input, derived),
    [derived, input],
  );
}
