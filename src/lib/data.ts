import { z } from "zod";
import coursesJson from "@/data/courses.json";
import programsJson from "@/data/programs.json";
import sitesJson from "@/data/sites.json";
import {
  Course,
  CourseSchema,
  Program,
  ProgramSchema,
  Site,
  SiteSchema,
} from "@/lib/types";

/**
 * Parses and cross-checks the three JSON data files. Throws with a readable
 * message when a swapped-in major config is malformed, so config errors
 * surface immediately at dev time instead of as silent UI bugs.
 */
function loadData(): {
  programs: Program[];
  courses: Course[];
  sites: Site[];
} {
  const programs = z.array(ProgramSchema).parse(programsJson);
  const courses = z.array(CourseSchema).parse(coursesJson);
  const sites = z.array(SiteSchema).parse(sitesJson);

  const errors: string[] = [];
  const courseIds = new Set(courses.map((c) => c.id));
  const siteIds = new Set(sites.map((s) => s.id));
  const categoryKeys = new Set(
    programs.flatMap((p) => p.categories.map((c) => `${p.id}/${c.id}`)),
  );

  const dupes = courses
    .map((c) => c.id)
    .filter((id, i, all) => all.indexOf(id) !== i);
  for (const id of dupes) errors.push(`courses.json: duplicate course id "${id}"`);

  if (sites.filter((s) => s.isHome).length !== 1) {
    errors.push(`sites.json: exactly one site must have "isHome": true`);
  }

  for (const program of programs) {
    for (const category of program.categories) {
      for (const courseId of category.rule.courses) {
        if (!courseIds.has(courseId)) {
          errors.push(
            `programs.json: ${program.id}/${category.id} references unknown course "${courseId}"`,
          );
        }
      }
    }
  }

  for (const course of courses) {
    for (const group of course.prereqs) {
      for (const prereqId of group) {
        if (!courseIds.has(prereqId)) {
          errors.push(
            `courses.json: ${course.id} has unknown prerequisite "${prereqId}"`,
          );
        }
      }
    }
    for (const siteId of course.sites) {
      if (!siteIds.has(siteId)) {
        errors.push(`courses.json: ${course.id} lists unknown site "${siteId}"`);
      }
    }
    for (const f of course.fulfills) {
      if (!categoryKeys.has(`${f.programId}/${f.categoryId}`)) {
        errors.push(
          `courses.json: ${course.id} fulfills unknown category "${f.programId}/${f.categoryId}"`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Course data validation failed:\n  - ${errors.join("\n  - ")}`);
  }

  return { programs, courses, sites };
}

const data = loadData();

export const PROGRAMS: Program[] = data.programs;
export const COURSES: Course[] = data.courses;
export const SITES: Site[] = data.sites;

export const COURSES_BY_ID: Map<string, Course> = new Map(
  COURSES.map((c) => [c.id, c]),
);
export const PROGRAMS_BY_ID: Map<string, Program> = new Map(
  PROGRAMS.map((p) => [p.id, p]),
);
export const SITES_BY_ID: Map<string, Site> = new Map(SITES.map((s) => [s.id, s]));

export const HOME_SITE: Site = SITES.find((s) => s.isHome)!;

/** Major program ids a course can count toward (excludes core/minor programs). */
export function crossListedMajors(course: Course): string[] {
  const majors = course.fulfills
    .filter((f) => PROGRAMS_BY_ID.get(f.programId)?.type === "major")
    .map((f) => f.programId);
  return [...new Set(majors)];
}

/**
 * Major program ids a course counts toward *among the active programs*.
 * A course fulfilling two mutually-exclusive majors (e.g. CS and DS, which
 * are never tracked together) is only "cross-listed" when both are active —
 * this keeps the allocation toggle and badge from appearing spuriously.
 */
export function activeCrossListedMajors(
  course: Course,
  activePrograms: string[],
): string[] {
  const active = new Set(activePrograms);
  return crossListedMajors(course).filter((id) => active.has(id));
}

/** True when the course competes between two or more majors (globally). */
export function isCrossListed(course: Course): boolean {
  return crossListedMajors(course).length >= 2;
}

/** True when the course competes between two or more *active* majors. */
export function isActivelyCrossListed(
  course: Course,
  activePrograms: string[],
): boolean {
  return activeCrossListedMajors(course, activePrograms).length >= 2;
}
