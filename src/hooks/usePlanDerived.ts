"use client";

import { useContext } from "react";
import { PlanDerivedContext } from "@/components/planner/PlanDerivedProvider";
import type { PlanDerivedValue } from "@/lib/derivePlan";

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
