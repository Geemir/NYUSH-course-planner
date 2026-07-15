import {
  CatalogResponseSchema,
  type CatalogResponse,
} from "@/lib/data";
import type { PlannerProgram } from "@/lib/requirements";
import type { Course, SpecialRule } from "@/lib/types";

const PROGRAM_COLORS = [
  "#57068c",
  "#2563eb",
  "#047857",
  "#b45309",
  "#be123c",
  "#6d28d9",
] as const;

export type ClientPlannerProgram = PlannerProgram & { color: string };

export interface ClientCatalogValue {
  snapshot: CatalogResponse["snapshot"];
  courses: Course[];
  programs: PlannerProgram[];
  rules: SpecialRule[];
}

/** Parse one coherent API/fallback response before exposing it to client engines. */
export function catalogValueFromResponse(input: unknown): ClientCatalogValue {
  const response = CatalogResponseSchema.parse(input);
  return response.snapshot.kind === "bulletin"
    ? {
        snapshot: response.snapshot,
        courses: response.courses,
        programs: response.programs,
        rules: response.rules,
      }
    : {
        snapshot: response.snapshot,
        courses: response.courses,
        programs: response.programs,
        rules: response.rules,
      };
}

export function selectActiveCatalogPrograms(
  programs: readonly PlannerProgram[],
  activeProgramIds: readonly string[],
): ClientPlannerProgram[] {
  const active = new Set(activeProgramIds);
  return programs
    .filter((program) => active.has(program.id))
    .map((program) => {
      if ("color" in program) return program;
      const hash = [...program.id].reduce(
        (total, character) => total + character.codePointAt(0)!,
        0,
      );
      return { ...program, color: PROGRAM_COLORS[hash % PROGRAM_COLORS.length] };
    });
}
