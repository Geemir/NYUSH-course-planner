import { placementCredits } from "@/lib/credits";
import { EMPTY_RULE_CONTEXT, type RuleContext } from "@/lib/rules";
import {
  courseCovers,
  type Course,
  type CatalogCategory,
  type CatalogProgram,
  type Category,
  type FulfillmentFact,
  type Placement,
  type Program,
  type Rule,
  type RequirementGap,
  type RequirementNode,
  type SemesterId,
} from "@/lib/types";

export type RequirementUnitKind = "courses" | "credits";

export interface RequirementDemand {
  units: number;
  unitKind: RequirementUnitKind;
}

export interface RequirementEvaluation {
  requiredUnits: number;
  unitKind: RequirementUnitKind;
  plannedUnits: number;
  completedUnits: number;
  plannedFraction: number;
  completedFraction: number;
  matchedCourseIds: string[];
  missingCourseIds: string[];
  manualState: "none" | "pending" | "satisfied";
  gaps: RequirementGap[];
}

export interface RequirementContext {
  placements: readonly Placement[];
  completedSemesters: readonly SemesterId[];
  coursesById: ReadonlyMap<string, Course>;
  fulfillmentFacts?: readonly FulfillmentFact[];
  /** Allocation-filtered placements allowed to satisfy direct legacy leaves. */
  eligibleCourseIds?: ReadonlySet<string>;
  rules?: RuleContext;
}

export type PlannerProgram = Program | CatalogProgram;
export type PlannerCategory = Category | CatalogCategory;

export function legacyRuleRequirement(rule: Rule): RequirementNode {
  const children: RequirementNode[] = rule.courses.map((courseId) => ({
    kind: "course",
    courseId,
  }));
  switch (rule.kind) {
    case "allOf":
      return { kind: "all", children };
    case "chooseN":
      return { kind: "choose", count: rule.n, children };
    case "creditsFrom":
      return { kind: "credits", minimum: rule.minCredits, children };
  }
}

export function categoryRequirement(category: PlannerCategory): RequirementNode {
  return "requirement" in category
    ? category.requirement
    : legacyRuleRequirement(category.rule);
}

function bounded(value: number, maximum: number): number {
  return Math.min(maximum, Math.max(0, value));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function result(
  demand: RequirementDemand,
  values: Omit<
    RequirementEvaluation,
    "requiredUnits" | "unitKind" | "plannedFraction" | "completedFraction"
  >,
): RequirementEvaluation {
  const plannedUnits = bounded(values.plannedUnits, demand.units);
  const completedUnits = bounded(values.completedUnits, demand.units);
  return {
    requiredUnits: demand.units,
    unitKind: demand.unitKind,
    ...values,
    plannedUnits,
    completedUnits,
    plannedFraction: demand.units === 0 ? 1 : plannedUnits / demand.units,
    completedFraction: demand.units === 0 ? 1 : completedUnits / demand.units,
  };
}

export function requirementDemand(node: RequirementNode): RequirementDemand {
  switch (node.kind) {
    case "course":
    case "attribute":
    case "waiver":
    case "manualConfirmation":
      return { units: 1, unitKind: "courses" };
    case "exclusion":
      return requirementDemand(node.child);
    case "any":
      return { units: 1, unitKind: "courses" };
    case "choose":
      return { units: node.count, unitKind: "courses" };
    case "credits":
      return { units: node.minimum, unitKind: "credits" };
    case "all": {
      const demands = node.children.map(requirementDemand);
      const sameUnit = demands.every(
        ({ unitKind }) => unitKind === demands[0]?.unitKind,
      );
      return sameUnit
        ? {
            units: demands.reduce((sum, item) => sum + item.units, 0),
            unitKind: demands[0]?.unitKind ?? "courses",
          }
        : { units: node.children.length, unitKind: "courses" };
    }
  }
}

function directCourseIds(node: RequirementNode): string[] {
  switch (node.kind) {
    case "course":
      return [node.courseId];
    case "all":
    case "any":
    case "choose":
    case "credits":
      return unique(node.children.flatMap(directCourseIds));
    case "exclusion":
      return directCourseIds(node.child).filter(
        (id) => !node.excludedCourseIds.includes(id),
      );
    case "attribute":
    case "waiver":
    case "manualConfirmation":
      return [];
  }
}

function aggregateManualState(
  children: readonly RequirementEvaluation[],
): RequirementEvaluation["manualState"] {
  if (
    children.some((child) =>
      child.gaps.some((gap) => gap.kind === "manual" || gap.kind === "waiver"),
    )
  ) {
    return "pending";
  }
  return children.some((child) => child.manualState === "satisfied")
    ? "satisfied"
    : "none";
}

export function evaluateRequirement(
  node: RequirementNode,
  context: RequirementContext,
): RequirementEvaluation {
  const completed = new Set(context.completedSemesters);
  const facts = context.fulfillmentFacts ?? [];
  const rules = context.rules ?? EMPTY_RULE_CONTEXT;

  const evaluate = (
    current: RequirementNode,
    placements: readonly Placement[],
  ): RequirementEvaluation => {
    const demand = requirementDemand(current);

    if (current.kind === "course") {
      const equivalentIds = new Set(rules.equivalentsOf(current.courseId));
      const match = placements.find((placement) => {
        const course = context.coursesById.get(placement.courseId);
        if (!course) return false;
        const covers =
          courseCovers(course, current.courseId) ||
          equivalentIds.has(placement.courseId);
        if (!covers) return false;
        return (
          context.eligibleCourseIds === undefined ||
          context.eligibleCourseIds.has(placement.courseId) ||
          placement.courseId !== current.courseId
        );
      });
      return result(demand, {
        plannedUnits: match ? 1 : 0,
        completedUnits: match && completed.has(match.semesterId) ? 1 : 0,
        matchedCourseIds: match ? [match.courseId] : [],
        missingCourseIds: match ? [] : [current.courseId],
        manualState: "none",
        gaps: [],
      });
    }

    if (current.kind === "attribute") {
      const matches = placements.filter((placement) => {
        if (
          context.eligibleCourseIds !== undefined &&
          !context.eligibleCourseIds.has(placement.courseId)
        ) {
          return false;
        }
        return (context.coursesById.get(placement.courseId)?.attributes ?? []).includes(
          current.attribute,
        );
      });
      return result(demand, {
        plannedUnits: matches.length > 0 ? 1 : 0,
        completedUnits: matches.some((item) => completed.has(item.semesterId))
          ? 1
          : 0,
        matchedCourseIds: unique(matches.map((item) => item.courseId)),
        missingCourseIds: [],
        manualState: "none",
        gaps:
          matches.length > 0
            ? []
            : [
                {
                  kind: "ambiguous",
                  label: `Complete a course with the ${current.attribute} attribute`,
                  candidateCourseIds: [],
                },
              ],
      });
    }

    if (current.kind === "waiver") {
      const satisfied = facts.some(
        (fact) =>
          fact.requirementId === current.waiverId &&
          (fact.kind === "waiver" || fact.kind === "exam"),
      );
      return result(demand, {
        plannedUnits: satisfied ? 1 : 0,
        completedUnits: satisfied ? 1 : 0,
        matchedCourseIds: [],
        missingCourseIds: [],
        manualState: satisfied ? "satisfied" : "pending",
        gaps: satisfied
          ? []
          : [
              {
                kind: "waiver",
                label: current.label,
                waiverId: current.waiverId,
              },
            ],
      });
    }

    if (current.kind === "manualConfirmation") {
      const satisfied = facts.some(
        (fact) =>
          fact.kind === "manualConfirmation" &&
          fact.requirementId === current.sourceText,
      );
      return result(demand, {
        plannedUnits: satisfied ? 1 : 0,
        completedUnits: satisfied ? 1 : 0,
        matchedCourseIds: [],
        missingCourseIds: [],
        manualState: satisfied ? "satisfied" : "pending",
        gaps: satisfied
          ? []
          : [
              {
                kind: "manual",
                label: current.label,
                sourceText: current.sourceText,
              },
            ],
      });
    }

    if (current.kind === "exclusion") {
      const excluded = new Set(current.excludedCourseIds);
      return evaluate(
        current.child,
        placements.filter((placement) => !excluded.has(placement.courseId)),
      );
    }

    const children = current.children.map((child) => evaluate(child, placements));

    if (current.kind === "all") {
      const sameUnit = children.every(
        (child) => child.unitKind === children[0]?.unitKind,
      );
      const plannedUnits = sameUnit
        ? children.reduce((sum, child) => sum + child.plannedUnits, 0)
        : children.reduce((sum, child) => sum + child.plannedFraction, 0);
      const completedUnits = sameUnit
        ? children.reduce((sum, child) => sum + child.completedUnits, 0)
        : children.reduce((sum, child) => sum + child.completedFraction, 0);
      return result(demand, {
        plannedUnits,
        completedUnits,
        matchedCourseIds: unique(children.flatMap((child) => child.matchedCourseIds)),
        missingCourseIds: unique(children.flatMap((child) => child.missingCourseIds)),
        manualState: aggregateManualState(children),
        gaps: children.flatMap((child) => child.gaps),
      });
    }

    if (current.kind === "any") {
      const plannedSelected = [...children].sort(
        (a, b) => b.plannedFraction - a.plannedFraction,
      )[0];
      const completedSelected = [...children].sort(
        (a, b) => b.completedFraction - a.completedFraction,
      )[0];
      if (children.length === 1 && plannedSelected) {
        return result(demand, {
          plannedUnits: plannedSelected.plannedFraction,
          completedUnits: plannedSelected.completedFraction,
          matchedCourseIds: plannedSelected.matchedCourseIds,
          missingCourseIds: plannedSelected.missingCourseIds,
          manualState: plannedSelected.manualState,
          gaps: plannedSelected.gaps,
        });
      }
      const satisfied = plannedSelected?.plannedFraction === 1;
      const selected = unique([
        ...(plannedSelected?.matchedCourseIds ?? []),
        ...(completedSelected?.matchedCourseIds ?? []),
      ]);
      const selectedChildren = [plannedSelected, completedSelected].filter(
        (item, index, items): item is RequirementEvaluation =>
          item !== undefined && items.indexOf(item) === index,
      );
      return result(demand, {
        plannedUnits: plannedSelected?.plannedFraction ?? 0,
        completedUnits: completedSelected?.completedFraction ?? 0,
        matchedCourseIds: selected,
        missingCourseIds: [],
        manualState: satisfied
          ? aggregateManualState(selectedChildren)
          : "none",
        gaps: satisfied
          ? (plannedSelected?.gaps ?? [])
          : [
              {
                kind: "ambiguous",
                label: "Choose one requirement",
                candidateCourseIds: directCourseIds(current),
              },
            ],
      });
    }

    if (current.kind === "choose") {
      if (current.count >= children.length) {
        return result(demand, {
          plannedUnits: children.reduce(
            (sum, child) => sum + child.plannedFraction,
            0,
          ),
          completedUnits: children.reduce(
            (sum, child) => sum + child.completedFraction,
            0,
          ),
          matchedCourseIds: unique(
            children.flatMap((child) => child.matchedCourseIds),
          ),
          missingCourseIds: unique(
            children.flatMap((child) => child.missingCourseIds),
          ),
          manualState: aggregateManualState(children),
          gaps: children.flatMap((child) => child.gaps),
        });
      }
      const plannedSelected = [...children]
        .sort((a, b) => b.plannedFraction - a.plannedFraction)
        .slice(0, current.count);
      const completedSelected = [...children]
        .sort((a, b) => b.completedFraction - a.completedFraction)
        .slice(0, current.count);
      const plannedUnits = plannedSelected.reduce(
        (sum, child) => sum + child.plannedFraction,
        0,
      );
      const completedUnits = completedSelected.reduce(
        (sum, child) => sum + child.completedFraction,
        0,
      );
      const selected = [...plannedSelected, ...completedSelected].filter(
        (item, index, items) => items.indexOf(item) === index,
      );
      const matched = new Set(selected.flatMap((child) => child.matchedCourseIds));
      const candidates = directCourseIds(current).filter((id) => !matched.has(id));
      return result(demand, {
        plannedUnits,
        completedUnits,
        matchedCourseIds: [...matched],
        missingCourseIds: [],
        manualState: aggregateManualState(selected),
        gaps:
          plannedUnits >= current.count
            ? plannedSelected.flatMap((child) => child.gaps)
            : [
                {
                  kind: "ambiguous",
                  label: `Choose ${current.count - plannedUnits} more requirement${current.count - plannedUnits === 1 ? "" : "s"}`,
                  candidateCourseIds: candidates,
                },
              ],
      });
    }

    const matchedCourseIds = unique(
      children.flatMap((child) => child.matchedCourseIds),
    );
    const matchedPlacements = placements.filter((placement) =>
      matchedCourseIds.includes(placement.courseId),
    );
    const plannedUnits = matchedPlacements.reduce((sum, placement) => {
      const course = context.coursesById.get(placement.courseId);
      return course ? sum + placementCredits(placement, course) : sum;
    }, 0);
    const completedUnits = matchedPlacements.reduce((sum, placement) => {
      const course = context.coursesById.get(placement.courseId);
      return course && completed.has(placement.semesterId)
        ? sum + placementCredits(placement, course)
        : sum;
    }, 0);
    const candidates = directCourseIds(current).filter(
      (id) => !matchedCourseIds.includes(id),
    );
    return result(demand, {
      plannedUnits,
      completedUnits,
      matchedCourseIds,
      missingCourseIds:
        plannedUnits < current.minimum && candidates.length === 1 ? candidates : [],
      manualState: aggregateManualState(children),
      gaps:
        plannedUnits < current.minimum && candidates.length !== 1
          ? [
              {
                kind: "ambiguous",
                label: `Choose ${current.minimum - plannedUnits} more credits`,
                candidateCourseIds: candidates,
              },
            ]
          : [],
    });
  };

  return evaluate(node, context.placements);
}
