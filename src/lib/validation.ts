import { EMPTY_RULE_CONTEXT, RuleContext } from "@/lib/rules";
import { placementCredits } from "@/lib/credits";
import {
  Course,
  courseCovers,
  Placement,
  PlanWarning,
  SemesterId,
  SEMESTER_IDS,
  semesterIndex,
  semesterLabel,
  semesterTerm,
  semesterYear,
} from "@/lib/types";

export const MAX_SEMESTER_CREDITS = 18;
export const MIN_SEMESTER_CREDITS = 12;

function describeOptions(
  group: string[],
  coursesById: Map<string, Course>,
): string {
  return group
    .map((id) => {
      const c = coursesById.get(id);
      return c ? `${c.title} (${c.id})` : id;
    })
    .join(" or ");
}

/**
 * Computes every rule violation in the current plan. Pure function of
 * (plan state, course data) — the UI derives all red flags from this list.
 */
export function computeWarnings(opts: {
  placements: Placement[];
  studyAway: Partial<Record<SemesterId, string>>;
  coursesById: Map<string, Course>;
  homeSiteId: string;
  siteNameById: Map<string, string>;
  budget: { limit: number; used: number } | null;
  doubleCounted: string[];
  /** Active special rules (equivalence, grade-conditional concurrency). */
  rules?: RuleContext;
}): PlanWarning[] {
  const {
    placements,
    studyAway,
    coursesById,
    homeSiteId,
    siteNameById,
    budget,
    doubleCounted,
    rules = EMPTY_RULE_CONTEXT,
  } = opts;

  const warnings: PlanWarning[] = [];

  // Semesters in which a given course id is satisfied — by the course itself,
  // by a placed course declaring it in `equivalentTo`, or by an equivalence
  // rule naming a placed course as standing in for it.
  const semestersCovering = (targetId: string): SemesterId[] => {
    const ruleEquivs = rules.equivalentsOf(targetId);
    return placements
      .filter((p) => {
        const course = coursesById.get(p.courseId);
        if (!course) return false;
        return courseCovers(course, targetId) || ruleEquivs.includes(p.courseId);
      })
      .map((p) => p.semesterId);
  };

  for (const placement of placements) {
    const course = coursesById.get(placement.courseId);
    if (!course) continue;
    const { semesterId } = placement;
    const placedAt = semesterIndex(semesterId);

    // --- Prerequisite chains (AND of OR-groups) ---
    for (const group of course.prereqs) {
      let coveredAtAll = false;
      let satisfiedEarlier = false;
      let satisfiedConcurrent = false; // same term, allowed by a special rule

      for (const optId of group) {
        for (const s of semestersCovering(optId)) {
          coveredAtAll = true;
          if (semesterIndex(s) < placedAt) {
            satisfiedEarlier = true;
          } else if (
            semesterIndex(s) === placedAt &&
            rules.concurrentPrereqRule(course.id, optId)
          ) {
            satisfiedConcurrent = true;
          }
        }
      }

      if (!coveredAtAll) {
        warnings.push({
          id: `prereq-missing:${course.id}:${group.join("|")}`,
          kind: "prereq-missing",
          severity: "error",
          courseId: course.id,
          semesterId,
          message: `${course.title} requires ${describeOptions(group, coursesById)}, which is not in your plan.`,
        });
      } else if (!satisfiedEarlier && !satisfiedConcurrent) {
        warnings.push({
          id: `prereq-concurrent:${course.id}:${group.join("|")}`,
          kind: "prereq-concurrent",
          severity: "warning",
          courseId: course.id,
          semesterId,
          message: `${course.title} requires ${describeOptions(group, coursesById)} in an earlier semester — it is currently scheduled in the same semester or later.`,
        });
      }
      // satisfiedConcurrent → a special rule permits the same-term placement,
      // so no warning; the active rule is shown in the rules panel.
    }

    // --- Term offering pattern ---
    const term = semesterTerm(semesterId);
    if (course.offeringKnown !== false && !course.offered.includes(term)) {
      warnings.push({
        id: `not-offered:${course.id}:${semesterId}`,
        kind: "not-offered",
        severity: "warning",
        courseId: course.id,
        semesterId,
        message: `${course.title} is typically offered in ${course.offered.join(" and ")} only, but is placed in a ${term} semester.`,
      });
    }

    // --- Study-away site availability ---
    const siteId = studyAway[semesterId] ?? homeSiteId;
    if (!course.sites.includes(siteId)) {
      const siteName = siteNameById.get(siteId) ?? siteId;
      warnings.push({
        id: `site-unavailable:${course.id}:${semesterId}`,
        kind: "site-unavailable",
        severity: "error",
        courseId: course.id,
        semesterId,
        message: `${course.title} is not available at ${siteName} (${semesterLabel(semesterId)} is set as a ${siteName} semester).`,
      });
    }

    // --- Capstone placed before senior year ---
    if (course.tags.includes("capstone") && semesterYear(semesterId) < 4) {
      warnings.push({
        id: `capstone-early:${course.id}:${semesterId}`,
        kind: "capstone-early",
        severity: "warning",
        courseId: course.id,
        semesterId,
        message: `${course.title} is a senior capstone but is placed in ${semesterLabel(semesterId)} — capstones are taken in Year 4.`,
      });
    }
  }

  // --- Per-semester credit load ---
  for (const semesterId of SEMESTER_IDS) {
    const credits = placements
      .filter((p) => p.semesterId === semesterId)
      .reduce((sum, p) => {
        const course = coursesById.get(p.courseId);
        return course ? sum + placementCredits(p, course) : sum;
      }, 0);
    if (credits > MAX_SEMESTER_CREDITS) {
      warnings.push({
        id: `overload:${semesterId}`,
        kind: "overload",
        severity: "warning",
        semesterId,
        message: `${semesterLabel(semesterId)} has ${credits} credits — above the ${MAX_SEMESTER_CREDITS}-credit limit (requires advisor approval).`,
      });
    } else if (credits > 0 && credits < MIN_SEMESTER_CREDITS) {
      warnings.push({
        id: `underload:${semesterId}`,
        kind: "underload",
        severity: "warning",
        semesterId,
        message: `${semesterLabel(semesterId)} has ${credits} credits — below the ${MIN_SEMESTER_CREDITS}-credit full-time minimum.`,
      });
    }
  }

  // --- Double-count budget (from the allocation engine) ---
  if (budget && budget.used > budget.limit) {
    warnings.push({
      id: `double-count-exceeded`,
      kind: "double-count-exceeded",
      severity: "error",
      message: `${budget.used} courses are split between both majors (${doubleCounted.join(", ")}), exceeding the double-count limit of ${budget.limit}.`,
    });
  }

  return warnings;
}
