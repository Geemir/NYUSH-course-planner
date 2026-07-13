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

/** Finds the preset whose program set equals the active set (order-insensitive). */
export function matchDegreePlan(activePrograms: string[]): string {
  const active = [...activePrograms].sort().join(",");
  const found = DEGREE_PLANS.find(
    (plan) => [...plan.programs].sort().join(",") === active,
  );
  return found?.id ?? CUSTOM_PLAN_ID;
}
