import { z } from "zod";
import catalogFallbackJson from "@/data/catalog-fallback.json";
import sitesJson from "@/data/sites.json";
import {
  CatalogProgramSchema,
  type CatalogProgram,
  Course,
  CourseSchema,
  Program,
  ProgramSchema,
  Site,
  SiteSchema,
  type SpecialRule,
  SpecialRuleSchema,
} from "@/lib/types";

const SnapshotMetadataSchema = z
  .object({
    id: z.string().min(1),
    sourceHash: z.string().min(1),
    publishedAt: z.string().datetime().optional(),
  })
  .strict();

function ruleCourseReferences(rule: SpecialRule): string[] {
  switch (rule.kind) {
    case "equivalence":
      return [rule.course, rule.target];
    case "concurrentPrereq":
      return [
        rule.course,
        rule.prereq,
        ...(rule.condition ? [rule.condition.course] : []),
      ];
  }
}

function addCatalogCoherenceIssues(
  response: {
    courses: Course[];
    programs: { id: string; categories: { id: string }[] }[];
    rules: SpecialRule[];
  },
  context: z.RefinementCtx,
): void {
  const courseIds = new Set(response.courses.map(({ id }) => id));
  const categoryKeys = new Set(
    response.programs.flatMap((program) =>
      program.categories.map((category) => `${program.id}/${category.id}`),
    ),
  );
  response.courses.forEach((course, courseIndex) => {
    course.fulfills.forEach(({ programId, categoryId }, fulfillmentIndex) => {
      if (!categoryKeys.has(`${programId}/${categoryId}`)) {
        context.addIssue({
          code: "custom",
          message: `Course "${course.id}" targets missing category "${programId}/${categoryId}"`,
          path: ["courses", courseIndex, "fulfills", fulfillmentIndex],
        });
      }
    });
  });
  response.rules.forEach((rule, ruleIndex) => {
    ruleCourseReferences(rule).forEach((courseId) => {
      if (!courseIds.has(courseId)) {
        context.addIssue({
          code: "custom",
          message: `Rule "${rule.id}" references missing course "${courseId}"`,
          path: ["rules", ruleIndex],
        });
      }
    });
  });
}

export const BootstrapCatalogResponseSchema = z
  .object({
    snapshot: SnapshotMetadataSchema.extend({
      kind: z.literal("bootstrap-legacy"),
    }),
    courses: z.array(CourseSchema).min(1),
    programs: z.array(ProgramSchema).min(1),
    rules: z.array(SpecialRuleSchema),
  })
  .strict()
  .superRefine(addCatalogCoherenceIssues);

export const BulletinCatalogResponseSchema = z
  .object({
    snapshot: SnapshotMetadataSchema.extend({ kind: z.literal("bulletin") }),
    courses: z.array(CourseSchema).min(1),
    programs: z.array(CatalogProgramSchema).min(1),
    rules: z.array(SpecialRuleSchema),
  })
  .strict()
  .superRefine((response, context) => {
    addCatalogCoherenceIssues(response, context);
    const duplicate = (ids: string[]) =>
      ids.find((id, index) => ids.indexOf(id) !== index);
    const duplicateCourseId = duplicate(response.courses.map(({ id }) => id));
    if (duplicateCourseId) {
      context.addIssue({
        code: "custom",
        message: `Duplicate course id "${duplicateCourseId}"`,
        path: ["courses"],
      });
    }
    const duplicateProgramId = duplicate(response.programs.map(({ id }) => id));
    if (duplicateProgramId) {
      context.addIssue({
        code: "custom",
        message: `Duplicate program id "${duplicateProgramId}"`,
        path: ["programs"],
      });
    }
    response.courses.forEach((course, index) => {
      if (course.provenance?.snapshotId !== response.snapshot.id) {
        context.addIssue({
          code: "custom",
          message: "Bulletin course provenance must match the response snapshot",
          path: ["courses", index, "provenance", "snapshotId"],
        });
      }
    });
    response.programs.forEach((program, index) => {
      if (program.provenance.snapshotId !== response.snapshot.id) {
        context.addIssue({
          code: "custom",
          message: "Bulletin program provenance must match the response snapshot",
          path: ["programs", index, "provenance", "snapshotId"],
        });
      }
    });
  });

export const CatalogResponseSchema = z.union([
  BulletinCatalogResponseSchema,
  BootstrapCatalogResponseSchema,
]);

export type BulletinCatalogResponse = z.infer<
  typeof BulletinCatalogResponseSchema
>;
export type BootstrapCatalogResponse = z.infer<
  typeof BootstrapCatalogResponseSchema
>;
export type CatalogResponse = z.infer<typeof CatalogResponseSchema>;

/** Checked-in, validated last-known-good catalog used when DB reads fail. */
export const CATALOG_FALLBACK: CatalogResponse = CatalogResponseSchema.parse(
  catalogFallbackJson,
);

/**
 * Preserves the legacy static exports while the dynamic catalog provider is
 * being migrated. The course and program values come from one coherent
 * generated fallback, never independently curated JSON files.
 */
function loadData(): {
  programs: Program[];
  bulletinPrograms: CatalogProgram[];
  courses: Course[];
  sites: Site[];
} {
  const bootstrap = BootstrapCatalogResponseSchema.safeParse(CATALOG_FALLBACK);
  const bulletin = BulletinCatalogResponseSchema.safeParse(CATALOG_FALLBACK);
  const programs: Program[] = bootstrap.success ? bootstrap.data.programs : [];
  const bulletinPrograms: CatalogProgram[] = bulletin.success
    ? bulletin.data.programs
    : [];
  const courses = CATALOG_FALLBACK.courses;
  const sites = z.array(SiteSchema).parse(sitesJson);

  const errors: string[] = [];
  const courseIds = new Set(courses.map((c) => c.id));
  const siteIds = new Set(sites.map((s) => s.id));
  const categoryKeys = new Set(
    [...programs, ...bulletinPrograms].flatMap((program) =>
      program.categories.map((category) => `${program.id}/${category.id}`),
    ),
  );

  const dupes = courses
    .map((c) => c.id)
    .filter((id, i, all) => all.indexOf(id) !== i);
  for (const id of dupes) {
    errors.push(`catalog-fallback.json: duplicate course id "${id}"`);
  }

  if (sites.filter((s) => s.isHome).length !== 1) {
    errors.push(`sites.json: exactly one site must have "isHome": true`);
  }

  for (const program of programs) {
    for (const category of program.categories) {
      for (const courseId of category.rule.courses) {
        if (!courseIds.has(courseId)) {
          errors.push(
            `catalog-fallback.json: ${program.id}/${category.id} references unknown course "${courseId}"`,
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
            `catalog-fallback.json: ${course.id} has unknown prerequisite "${prereqId}"`,
          );
        }
      }
    }
    for (const siteId of course.sites) {
      if (!siteIds.has(siteId)) {
        errors.push(
          `catalog-fallback.json: ${course.id} lists unknown site "${siteId}"`,
        );
      }
    }
    for (const f of course.fulfills) {
      if (!categoryKeys.has(`${f.programId}/${f.categoryId}`)) {
        errors.push(
          `catalog-fallback.json: ${course.id} fulfills unknown category "${f.programId}/${f.categoryId}"`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Course data validation failed:\n  - ${errors.join("\n  - ")}`);
  }

  return { programs, bulletinPrograms, courses, sites };
}

const data = loadData();

export const PROGRAMS: Program[] = data.programs;
/** Rich official programs; empty only while the fallback is bootstrap legacy. */
export const BULLETIN_PROGRAMS: CatalogProgram[] = data.bulletinPrograms;
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
