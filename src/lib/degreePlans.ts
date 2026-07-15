import type { PlannerProgram } from "@/lib/requirements";

/**
 * Curated degree-plan presets. Each sets which programs are tracked
 * (rings + requirement checklists). "core" is always included.
 *
 * These reference program ids from programs.json; adding a new major/minor
 * there lets you compose new presets here without touching components.
 */
export interface DegreePlan {
  id: string;
  label: string;
  /** Tracked program ids, in display order (core first). */
  programs: string[];
}

export const DEGREE_PLANS: DegreePlan[] = [
  { id: "cs-ima", label: "CS + IMA (double major)", programs: ["core", "cs", "ima"] },
  { id: "ds-ima", label: "Data Science + IMA (double major)", programs: ["core", "ds", "ima"] },
  { id: "ds-ima-minor", label: "Data Science + IMA minor", programs: ["core", "ds", "ima-minor"] },
  { id: "cs-ima-minor", label: "Computer Science + IMA minor", programs: ["core", "cs", "ima-minor"] },
];

/** Id used by the chooser when the active set matches no preset. */
export const CUSTOM_PLAN_ID = "custom";

export function degreeOptionsFromPrograms(
  programs: readonly PlannerProgram[],
): DegreePlan[] {
  const coreId = programs.find((program) => program.type === "core")?.id;
  return programs
    .filter((program) => program.type === "major")
    .map((program) => ({
      id: program.id,
      label: program.name,
      programs: coreId ? [coreId, program.id] : [program.id],
    }));
}

export function reconcileProgramSelection(
  activeIds: readonly string[],
  validIds: readonly string[],
  defaultIds: readonly string[],
): string[] {
  const valid = new Set(validIds);
  const active = activeIds.filter(
    (id, index) => valid.has(id) && activeIds.indexOf(id) === index,
  );
  const coreId = defaultIds[0];
  const hasTrackedProgram = active.some((id) => id !== coreId);
  if (hasTrackedProgram) return active;

  return defaultIds.filter(
    (id, index) => valid.has(id) && defaultIds.indexOf(id) === index,
  );
}

/** Finds the option whose program set equals the active set (order-insensitive). */
export function matchDegreePlan(
  activePrograms: string[],
  options: readonly DegreePlan[] = DEGREE_PLANS,
): string {
  const active = [...activePrograms].sort().join(",");
  const found = options.find(
    (plan) => [...plan.programs].sort().join(",") === active,
  );
  return found?.id ?? CUSTOM_PLAN_ID;
}
