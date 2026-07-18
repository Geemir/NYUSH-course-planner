import programsJson from "@/data/programs.json";
import sitesJson from "@/data/sites.json";
import {
  ProgramSchema,
  SiteSchema,
  type Course,
  type Program,
  type Site,
} from "@/lib/types";

/** Lightweight shell metadata that does not pull the multi-megabyte course fallback into client chunks. */
export const PROGRAMS: Program[] = ProgramSchema.array().parse(programsJson);
export const SITES: Site[] = SiteSchema.array().parse(sitesJson);
export const PROGRAMS_BY_ID = new Map(PROGRAMS.map((program) => [program.id, program]));
export const SITES_BY_ID = new Map(SITES.map((site) => [site.id, site]));
export const HOME_SITE = SITES.find((site) => site.isHome)!;

export function activeCrossListedMajors(
  course: Course,
  activePrograms: string[],
): string[] {
  const active = new Set(activePrograms);
  return [...new Set(
    course.fulfills
      .filter((item) => PROGRAMS_BY_ID.get(item.programId)?.type === "major")
      .map((item) => item.programId)
      .filter((id) => active.has(id)),
  )];
}

export function isActivelyCrossListed(
  course: Course,
  activePrograms: string[],
): boolean {
  return activeCrossListedMajors(course, activePrograms).length >= 2;
}
