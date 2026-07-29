import { placementCredits } from "@/lib/credits";
import {
  categoryRequirement,
  evaluateRequirement,
  legacyRuleRequirement,
  requirementDemand,
  type PlannerProgram,
} from "@/lib/requirements";
import { EMPTY_RULE_CONTEXT, type RuleContext } from "@/lib/rules";
import type {
  CategoryProgress,
  Course,
  Fulfillment,
  FulfillmentFact,
  RequirementStatusOverride,
  Placement,
  ProgramProgress,
  RequirementNode,
  SemesterId,
} from "@/lib/types";

export const GRADUATION_CREDITS = 128;

export interface ProgressResult {
  programs: ProgramProgress[];
  credits: { goal: number; planned: number; completed: number };
}

function withLegacyPoolCredits(
  category: PlannerProgram["categories"][number],
  creditedCourseIds: readonly string[],
): RequirementNode {
  if (!("rule" in category)) return categoryRequirement(category);
  if (category.rule.kind === "allOf") return legacyRuleRequirement(category.rule);

  const courseIds = [...new Set([...category.rule.courses, ...creditedCourseIds])];
  const children: RequirementNode[] = courseIds.map((courseId) => ({
    kind: "course",
    courseId,
  }));
  return category.rule.kind === "chooseN"
    ? { kind: "choose", count: category.rule.n, children }
    : { kind: "credits", minimum: category.rule.minCredits, children };
}

function categoryWeight(node: RequirementNode): number {
  const demand = requirementDemand(node);
  return demand.unitKind === "credits" ? demand.units / 4 : demand.units;
}

export function computeProgress(opts: {
  placements: Placement[];
  completedSemesters: SemesterId[];
  coursesById: Map<string, Course>;
  programs: PlannerProgram[];
  /** From resolveAllocations(): courseId -> fulfillments receiving credit. */
  effective: Map<string, Fulfillment[]>;
  fulfillmentFacts?: FulfillmentFact[];
  requirementStatusOverrides?: RequirementStatusOverride[];
  /** Active special rules (equivalence affects requirement matching). */
  rules?: RuleContext;
}): ProgressResult {
  const {
    placements,
    completedSemesters,
    coursesById,
    programs,
    effective,
    fulfillmentFacts = [],
    requirementStatusOverrides = [],
    rules = EMPTY_RULE_CONTEXT,
  } = opts;
  const completed = new Set(completedSemesters);

  const programResults: ProgramProgress[] = programs.map((program) => {
    const categoryNodes: RequirementNode[] = [];
    const categories: CategoryProgress[] = program.categories.map((category) => {
      const credited = placements
        .map((placement) => placement.courseId)
        .filter((courseId) =>
          (effective.get(courseId) ?? []).some(
            (fulfillment) =>
              fulfillment.programId === program.id &&
              fulfillment.categoryId === category.id,
          ),
        );
      const node = withLegacyPoolCredits(category, credited);
      categoryNodes.push(node);
      const evaluation = evaluateRequirement(node, {
        placements,
        completedSemesters,
        coursesById,
        fulfillmentFacts,
        rules,
        ...("rule" in category
          ? { eligibleCourseIds: new Set(credited) }
          : {}),
      });

      const manualStatus = requirementStatusOverrides.find(
        (override) => override.programId === program.id && override.categoryId === category.id,
      )?.status ?? null;
      const calculatedCompletedUnits = evaluation.completedUnits;
      const calculatedPlannedUnits = evaluation.plannedUnits;
      const completedUnits = manualStatus === "completed"
        ? evaluation.requiredUnits
        : calculatedCompletedUnits;
      const plannedUnits = manualStatus
        ? evaluation.requiredUnits
        : calculatedPlannedUnits;

      return {
        programId: program.id,
        categoryId: category.id,
        name: category.name,
        isCapstone: "isCapstone" in category ? category.isCapstone : false,
        requiredUnits: evaluation.requiredUnits,
        unitKind: evaluation.unitKind,
        completedUnits,
        plannedUnits,
        calculatedCompletedUnits,
        calculatedPlannedUnits,
        manualStatus,
        matchedCourseIds: evaluation.matchedCourseIds,
        missingCourseIds: evaluation.missingCourseIds,
        manualState: evaluation.manualState,
        gaps: evaluation.gaps,
      };
    });

    const weights = categoryNodes.map(categoryWeight);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const weighted = (pick: (category: CategoryProgress) => number) =>
      totalWeight === 0
        ? 0
        : categories.reduce(
            (sum, category, index) =>
              sum +
              weights[index] *
                (category.requiredUnits === 0
                  ? 0
                  : pick(category) / category.requiredUnits),
            0,
          ) / totalWeight;

    return {
      programId: program.id,
      plannedFraction: weighted((category) => category.plannedUnits),
      completedFraction: weighted((category) => category.completedUnits),
      categories,
    };
  });

  let planned = 0;
  let completedCredits = 0;
  for (const placement of placements) {
    const course = coursesById.get(placement.courseId);
    if (!course) continue;
    const credits = placementCredits(placement, course);
    planned += credits;
    if (completed.has(placement.semesterId)) completedCredits += credits;
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
