import { EMPTY_RULE_CONTEXT, RuleContext } from "@/lib/rules";
import {
  Category,
  CategoryProgress,
  Course,
  Fulfillment,
  Placement,
  Program,
  ProgramProgress,
  SemesterId,
} from "@/lib/types";

export const GRADUATION_CREDITS = 128;

export interface ProgressResult {
  programs: ProgramProgress[];
  credits: { goal: number; planned: number; completed: number };
}

function requiredUnits(category: Category): number {
  const rule = category.rule;
  switch (rule.kind) {
    case "allOf":
      return rule.courses.length;
    case "chooseN":
      return rule.n;
    case "creditsFrom":
      return rule.minCredits;
  }
}

/**
 * Weight used when averaging categories into one program fraction:
 * approximate "number of courses" so a 16-credit elective pool doesn't
 * drown out a 3-course foundation category.
 */
function categoryWeight(category: Category): number {
  return category.rule.kind === "creditsFrom"
    ? requiredUnits(category) / 4
    : requiredUnits(category);
}

export function computeProgress(opts: {
  placements: Placement[];
  completedSemesters: SemesterId[];
  coursesById: Map<string, Course>;
  programs: Program[];
  /** From resolveAllocations(): courseId -> fulfillments receiving credit. */
  effective: Map<string, Fulfillment[]>;
  /** Active special rules (equivalence affects requirement matching). */
  rules?: RuleContext;
}): ProgressResult {
  const {
    placements,
    completedSemesters,
    coursesById,
    programs,
    effective,
    rules = EMPTY_RULE_CONTEXT,
  } = opts;
  const completed = new Set(completedSemesters);
  const placementByCourse = new Map(placements.map((p) => [p.courseId, p]));

  const programResults: ProgramProgress[] = programs.map((program) => {
    const categories: CategoryProgress[] = program.categories.map((category) => {
      const required = requiredUnits(category);

      // Placed courses whose effective fulfillments credit this category.
      // For pool rules (chooseN/creditsFrom) any crediting course counts —
      // including user-added custom courses outside the rule's static list.
      // allOf demands the specific listed courses, or a declared equivalent.
      const credited = placements
        .map((p) => p.courseId)
        .filter((courseId) =>
          (effective.get(courseId) ?? []).some(
            (f) => f.programId === program.id && f.categoryId === category.id,
          ),
        );

      let plannedUnits = 0;
      let completedUnits = 0;
      let matched: string[] = [];
      let missingCourseIds: string[] = [];

      const isDone = (courseId: string) =>
        completed.has(placementByCourse.get(courseId)!.semesterId);

      if (category.rule.kind === "allOf") {
        // Each required slot can be satisfied by the exact (credited) course
        // or by any placed course declaring it in `equivalentTo`.
        const satisfiers = category.rule.courses.map((slotId) => {
          if (credited.includes(slotId)) return slotId;
          const ruleEquivs = rules.equivalentsOf(slotId);
          return placements
            .map((p) => p.courseId)
            .find(
              (courseId) =>
                (coursesById.get(courseId)?.equivalentTo ?? []).includes(slotId) ||
                ruleEquivs.includes(courseId),
            );
        });
        plannedUnits = satisfiers.filter(Boolean).length;
        completedUnits = satisfiers.filter(
          (id): id is string => id !== undefined && isDone(id),
        ).length;
        matched = [...new Set(satisfiers.filter((id): id is string => !!id))];
        missingCourseIds = category.rule.courses.filter(
          (_, i) => satisfiers[i] === undefined,
        );
      } else {
        // Pool rules: credited courses plus placed equivalents of pool members.
        const poolIds = category.rule.courses;
        const viaEquivalence = placements
          .map((p) => p.courseId)
          .filter(
            (courseId) =>
              !credited.includes(courseId) &&
              ((coursesById.get(courseId)?.equivalentTo ?? []).some((id) =>
                poolIds.includes(id),
              ) ||
                poolIds.some((poolId) =>
                  rules.equivalentsOf(poolId).includes(courseId),
                )),
          );
        matched = [...new Set([...credited, ...viaEquivalence])];

        const units = (courseId: string): number => {
          const course = coursesById.get(courseId);
          if (!course) return 0;
          return category.rule.kind === "creditsFrom" ? course.credits : 1;
        };

        // Count completed courses first so the earned portion is preserved
        // when capping at the requirement.
        const matchedSorted = [...matched].sort(
          (a, b) => (isDone(a) ? 0 : 1) - (isDone(b) ? 0 : 1),
        );
        for (const courseId of matchedSorted) {
          const u = Math.min(units(courseId), required - plannedUnits);
          if (u <= 0) break;
          plannedUnits += u;
          if (isDone(courseId)) completedUnits += u;
        }
      }

      return {
        programId: program.id,
        categoryId: category.id,
        name: category.name,
        isCapstone: category.isCapstone,
        requiredUnits: required,
        unitKind: category.rule.kind === "creditsFrom" ? "credits" : "courses",
        completedUnits,
        plannedUnits,
        matchedCourseIds: matched,
        missingCourseIds,
      };
    });

    const totalWeight = program.categories.reduce(
      (sum, c) => sum + categoryWeight(c),
      0,
    );
    const weighted = (pick: (c: CategoryProgress) => number) =>
      totalWeight === 0
        ? 0
        : categories.reduce(
            (sum, c, i) =>
              sum +
              categoryWeight(program.categories[i]) *
                (c.requiredUnits === 0 ? 0 : pick(c) / c.requiredUnits),
            0,
          ) / totalWeight;

    return {
      programId: program.id,
      plannedFraction: weighted((c) => c.plannedUnits),
      completedFraction: weighted((c) => c.completedUnits),
      categories,
    };
  });

  let planned = 0;
  let completedCredits = 0;
  for (const placement of placements) {
    const course = coursesById.get(placement.courseId);
    if (!course) continue;
    planned += course.credits;
    if (completed.has(placement.semesterId)) completedCredits += course.credits;
  }

  return {
    programs: programResults,
    credits: {
      goal: GRADUATION_CREDITS,
      planned,
      completed: completedCredits,
    },
  };
}
