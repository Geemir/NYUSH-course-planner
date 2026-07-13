import {
  Course,
  Fulfillment,
  Placement,
  Program,
  Rule,
  semesterIndex,
} from "@/lib/types";

export interface AllocationResult {
  /**
   * courseId -> the fulfillments that actually receive credit, after
   * applying each placement's allocation choice. Core and minor fulfillments
   * always pass through; competing major fulfillments are filtered.
   */
  effective: Map<string, Fulfillment[]>;
  /** Course ids currently credited toward two or more majors. */
  doubleCounted: string[];
  /** Double-count budget across active majors; null with fewer than 2 majors. */
  budget: { limit: number; used: number } | null;
}

const DEFAULT_DOUBLE_COUNT_LIMIT = 2;

function ruleUnits(rule: Rule): number {
  switch (rule.kind) {
    case "allOf":
      return rule.courses.length;
    case "chooseN":
      return rule.n;
    case "creditsFrom":
      return rule.minCredits;
  }
}

function unitsForCourse(rule: Rule, course: Course): number {
  return rule.kind === "creditsFrom" ? course.credits : 1;
}

/**
 * Resolves which program categories each placed course actually counts
 * toward. "auto" cross-listed courses are assigned greedily, in chronological
 * order, to the first active major (by activePrograms order) whose matching
 * category still has unmet demand.
 */
export function resolveAllocations(opts: {
  placements: Placement[];
  coursesById: Map<string, Course>;
  programsById: Map<string, Program>;
  activePrograms: string[];
}): AllocationResult {
  const { placements, coursesById, programsById, activePrograms } = opts;

  const active = activePrograms
    .map((id) => programsById.get(id))
    .filter((p): p is Program => p !== undefined);
  const activeIds = new Set(active.map((p) => p.id));
  const programOrder = new Map(activePrograms.map((id, i) => [id, i]));

  // Remaining demand per "programId/categoryId", in rule units.
  const demand = new Map<string, number>();
  const rules = new Map<string, Rule>();
  for (const program of active) {
    for (const category of program.categories) {
      const key = `${program.id}/${category.id}`;
      demand.set(key, ruleUnits(category.rule));
      rules.set(key, category.rule);
    }
  }

  const consume = (f: Fulfillment, course: Course) => {
    const key = `${f.programId}/${f.categoryId}`;
    const rule = rules.get(key);
    if (!rule) return;
    demand.set(
      key,
      Math.max(0, (demand.get(key) ?? 0) - unitsForCourse(rule, course)),
    );
  };

  const sorted = [...placements].sort(
    (a, b) =>
      semesterIndex(a.semesterId) - semesterIndex(b.semesterId) ||
      a.courseId.localeCompare(b.courseId),
  );

  const effective = new Map<string, Fulfillment[]>();
  const doubleCounted: string[] = [];

  for (const placement of sorted) {
    const course = coursesById.get(placement.courseId);
    if (!course) continue;

    const fulfills = course.fulfills.filter((f) => activeIds.has(f.programId));
    // Core and minor credit always passes through; only majors compete for a
    // shared course via the allocation toggle / double-count budget.
    const passThroughFulfills = fulfills.filter(
      (f) => programsById.get(f.programId)?.type !== "major",
    );
    const majorFulfills = fulfills.filter(
      (f) => programsById.get(f.programId)?.type === "major",
    );

    let chosenMajors: Fulfillment[];
    if (majorFulfills.length <= 1) {
      chosenMajors = majorFulfills;
    } else if (placement.allocation === "split") {
      chosenMajors = majorFulfills;
      doubleCounted.push(course.id);
    } else {
      const explicit = majorFulfills.find(
        (f) => f.programId === placement.allocation,
      );
      if (explicit) {
        chosenMajors = [explicit];
      } else {
        // "auto": prefer the major whose category still needs this course.
        const ordered = [...majorFulfills].sort(
          (a, b) =>
            (programOrder.get(a.programId) ?? 99) -
            (programOrder.get(b.programId) ?? 99),
        );
        const needy = ordered.find(
          (f) => (demand.get(`${f.programId}/${f.categoryId}`) ?? 0) > 0,
        );
        chosenMajors = [needy ?? ordered[0]];
      }
    }

    const chosen = [...passThroughFulfills, ...chosenMajors];
    for (const f of chosen) consume(f, course);
    effective.set(course.id, chosen);
  }

  const activeMajors = active.filter((p) => p.type === "major");
  let budget: AllocationResult["budget"] = null;
  if (activeMajors.length >= 2) {
    const limit = Math.min(
      ...activeMajors.map((p) => p.doubleCountLimit ?? DEFAULT_DOUBLE_COUNT_LIMIT),
    );
    budget = { limit, used: doubleCounted.length };
  }

  return { effective, doubleCounted, budget };
}
