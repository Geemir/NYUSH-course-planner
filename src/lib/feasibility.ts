import { EMPTY_RULE_CONTEXT, RuleContext } from "@/lib/rules";
import { placementCredits } from "@/lib/credits";
import type { PlannerProgram } from "@/lib/requirements";
import {
  Course,
  courseCovers,
  Placement,
  ProgramProgress,
  RequirementGap,
  SemesterId,
  SEMESTER_IDS,
  semesterIndex,
  semesterTerm,
  semesterYear,
} from "@/lib/types";
import { MAX_SEMESTER_CREDITS } from "@/lib/validation";

export type FeasibilityStatus =
  | "complete" // all active requirements already satisfied by the current plan
  | "feasible" // remaining requirements fit within the 18-credit cap by Y4 Spring
  | "feasible-with-overload" // they fit only if some terms exceed 18 credits
  | "infeasible"; // some requirement can't be scheduled at all

export interface FeasibilityReport {
  status: FeasibilityStatus;
  /** Auto-scheduled additions needed to finish (courseId → semester). */
  suggestion: { courseId: string; semesterId: SemesterId }[];
  /** Terms (existing + suggested) that exceed the 18-credit cap. */
  overloadedTerms: { semesterId: SemesterId; credits: number }[];
  /** Requirements that could not be scheduled, with a reason. */
  unplaceable: { courseId: string; reason: string }[];
  /** Advisor/waiver/choice work that cannot be represented as a course. */
  requirementGaps: RequirementGap[];
  remaining: { courses: number; credits: number };
}

interface AnalyzeOpts {
  programs: PlannerProgram[];
  progressByProgram: Map<string, ProgramProgress>;
  placements: Placement[];
  completedSemesters: SemesterId[];
  studyAway: Partial<Record<SemesterId, string>>;
  coursesById: Map<string, Course>;
  homeSiteId: string;
  rules?: RuleContext;
}

function credits(coursesById: Map<string, Course>, id: string): number {
  return coursesById.get(id)?.credits ?? 4;
}

/**
 * Derives the courses still needed to finish the active programs, attempts to
 * greedily schedule them (and their prerequisites) into the remaining open
 * terms, and reports whether the plan is finishable — and whether finishing
 * requires overloading any semester. Pure: no DB / network / React.
 */
export function analyzeFeasibility(opts: AnalyzeOpts): FeasibilityReport {
  const {
    programs,
    progressByProgram,
    placements,
    completedSemesters,
    studyAway,
    coursesById,
    homeSiteId,
    rules = EMPTY_RULE_CONTEXT,
  } = opts;

  const placedIds = new Set(placements.map((p) => p.courseId));
  const completed = new Set(completedSemesters);

  // --- 1. Which courses are still needed to satisfy unmet requirements? ---
  const needed = new Set<string>();
  const requirementGaps: RequirementGap[] = [];

  for (const program of programs) {
    const pp = progressByProgram.get(program.id);
    if (!pp) continue;
    program.categories.forEach((_category, i) => {
      const cp = pp.categories[i];
      if (!cp || cp.plannedUnits >= cp.requiredUnits) return;
      for (const id of cp.missingCourseIds) needed.add(id);
      requirementGaps.push(...cp.gaps);
    });
  }

  // --- 2. Pull in prerequisites of needed courses (transitive). ---
  const haveOrNeeded = (id: string) => placedIds.has(id) || needed.has(id);
  const addPrereqClosure = (id: string, seen: Set<string>) => {
    if (seen.has(id)) return;
    seen.add(id);
    const course = coursesById.get(id);
    if (!course) return;
    for (const group of course.prereqs) {
      // Satisfied already if any option is placed or already needed.
      if (group.some(haveOrNeeded)) {
        group.filter((o) => needed.has(o)).forEach((o) => addPrereqClosure(o, seen));
        continue;
      }
      // Otherwise add the first option that exists in the catalog.
      const pick = group.find((o) => coursesById.has(o));
      if (pick) {
        needed.add(pick);
        addPrereqClosure(pick, seen);
      }
    }
  };
  for (const id of [...needed]) addPrereqClosure(id, new Set());

  // A requirement gap only makes the plan *infeasible* when nothing can satisfy
  // it (an exhausted credit pool / attribute with no candidate). An ambiguous
  // gap that still lists candidate courses ("choose 2 more electives") is the
  // normal state of an in-progress plan — a pending choice, not a dead end.
  const blockingGaps = requirementGaps.filter(
    (gap) => !(gap.kind === "ambiguous" && gap.candidateCourseIds.length > 0),
  );

  // Remaining = needed courses not already placed.
  const toSchedule = [...needed].filter((id) => !placedIds.has(id));
  if (toSchedule.length === 0) {
    const overloadedTerms = collectOverloads(placements, coursesById);
    const status: FeasibilityStatus = blockingGaps.length > 0
      ? "infeasible"
      : overloadedTerms.length > 0
        ? "feasible-with-overload"
        : requirementGaps.length > 0
          ? "feasible"
          : "complete";
    return {
      status,
      suggestion: [],
      overloadedTerms,
      unplaceable: [],
      requirementGaps,
      remaining: { courses: 0, credits: 0 },
    };
  }

  // --- 3. Greedy term-by-term scheduling. ---
  const openTerms = SEMESTER_IDS.filter((s) => !completed.has(s));
  // courseId -> term index where it's available as a prerequisite.
  const assignedIndex = new Map<string, number>();
  for (const p of placements) assignedIndex.set(p.courseId, semesterIndex(p.semesterId));

  const termCredits = new Map<SemesterId, number>();
  for (const p of placements) {
    const course = coursesById.get(p.courseId);
    termCredits.set(
      p.semesterId,
      (termCredits.get(p.semesterId) ?? 0) +
        (course ? placementCredits(p, course) : 0),
    );
  }

  const suggestion: { courseId: string; semesterId: SemesterId }[] = [];

  /** True if every prereq group of `id` is met strictly before `termIdx`. */
  const prereqsMetBefore = (id: string, termIdx: number): boolean => {
    const course = coursesById.get(id);
    if (!course) return true;
    return course.prereqs.every((group) =>
      group.some((optId) => {
        // direct/equivalent placement before termIdx
        for (const [cid, idx] of assignedIndex) {
          if (idx >= termIdx) continue;
          const c = coursesById.get(cid);
          if (c && courseCovers(c, optId)) return true;
          if (rules.equivalentsOf(optId).includes(cid)) return true;
        }
        return false;
      }),
    );
  };

  const fitsTerm = (id: string, term: SemesterId, capped: boolean): boolean => {
    const course = coursesById.get(id);
    if (!course) return false;
    if (
      course.offeringKnown !== false &&
      !course.offered.includes(semesterTerm(term))
    ) {
      return false;
    }
    const site = studyAway[term] ?? homeSiteId;
    if (!course.sites.includes(site)) return false;
    if (course.tags.includes("capstone") && semesterYear(term) < 4) return false;
    if (capped) {
      const load = termCredits.get(term) ?? 0;
      if (load + credits(coursesById, id) > MAX_SEMESTER_CREDITS) return false;
    }
    return true;
  };

  const place = (id: string, term: SemesterId) => {
    suggestion.push({ courseId: id, semesterId: term });
    assignedIndex.set(id, semesterIndex(term));
    termCredits.set(term, (termCredits.get(term) ?? 0) + credits(coursesById, id));
  };

  const tryScheduleAll = (ids: Set<string>, capped: boolean) => {
    let progress = true;
    while (progress && ids.size > 0) {
      progress = false;
      // Stable order: by number of prereq groups (shallow first), then id.
      const ordered = [...ids].sort((a, b) => {
        const da = coursesById.get(a)?.prereqs.length ?? 0;
        const db = coursesById.get(b)?.prereqs.length ?? 0;
        return da - db || a.localeCompare(b);
      });
      for (const id of ordered) {
        const term = openTerms.find(
          (t) => prereqsMetBefore(id, semesterIndex(t)) && fitsTerm(id, t, capped),
        );
        if (term) {
          place(id, term);
          ids.delete(id);
          progress = true;
        }
      }
    }
  };

  const pending = new Set(toSchedule);
  tryScheduleAll(pending, true); // first respect the 18-credit cap
  const neededOverload = pending.size > 0;
  if (neededOverload) tryScheduleAll(pending, false); // then allow overload

  // Anything still pending can't be scheduled (offering / prereq / site).
  const unplaceable = [...pending].map((id) => ({
    courseId: id,
    reason: reasonUnplaceable(id, coursesById, openTerms, prereqsMetBefore, studyAway, homeSiteId),
  }));

  const overloadedTerms = collectOverloads(
    [...placements, ...suggestion.map((s) => ({ courseId: s.courseId, semesterId: s.semesterId, allocation: "auto" as const }))],
    coursesById,
  );

  let status: FeasibilityStatus;
  if (unplaceable.length > 0 || blockingGaps.length > 0) status = "infeasible";
  else if (neededOverload || overloadedTerms.length > 0) status = "feasible-with-overload";
  else status = "feasible";

  return {
    status,
    suggestion,
    overloadedTerms,
    unplaceable,
    requirementGaps,
    remaining: {
      courses: suggestion.length + unplaceable.length,
      credits:
        suggestion.reduce((s, x) => s + credits(coursesById, x.courseId), 0) +
        unplaceable.reduce((s, x) => s + credits(coursesById, x.courseId), 0),
    },
  };
}

function collectOverloads(
  placements: Placement[],
  coursesById: Map<string, Course>,
): { semesterId: SemesterId; credits: number }[] {
  const byTerm = new Map<SemesterId, number>();
  for (const p of placements) {
    byTerm.set(
      p.semesterId,
      (byTerm.get(p.semesterId) ?? 0) +
        (coursesById.has(p.courseId)
          ? placementCredits(p, coursesById.get(p.courseId)!)
          : 0),
    );
  }
  return SEMESTER_IDS.filter((s) => (byTerm.get(s) ?? 0) > MAX_SEMESTER_CREDITS).map(
    (s) => ({ semesterId: s, credits: byTerm.get(s)! }),
  );
}

function reasonUnplaceable(
  id: string,
  coursesById: Map<string, Course>,
  openTerms: SemesterId[],
  prereqsMetBefore: (id: string, termIdx: number) => boolean,
  studyAway: Partial<Record<SemesterId, string>>,
  homeSiteId: string,
): string {
  const course = coursesById.get(id);
  if (!course) return "not in the catalog";
  const isCapstone = course.tags.includes("capstone");

  // Mirror the scheduler's constraints, narrowing term by term.
  let terms =
    course.offeringKnown === false
      ? [...openTerms]
      : openTerms.filter((t) => course.offered.includes(semesterTerm(t)));
  if (terms.length === 0)
    return `only offered in ${course.offered.join("/")}, with no open ${course.offered.join("/")} term left`;

  if (isCapstone) {
    terms = terms.filter((t) => semesterYear(t) >= 4);
    if (terms.length === 0)
      return "capstones must be taken in senior year, but no Year 4 term is open";
  }

  const siteOk = terms.filter((t) =>
    course.sites.includes(studyAway[t] ?? homeSiteId),
  );
  if (siteOk.length === 0)
    return isCapstone
      ? "capstones must be taken on the Shanghai campus, but your Year 4 is set to a study-away site"
      : "not available at your study-away site(s)";

  if (!siteOk.some((t) => prereqsMetBefore(id, semesterIndex(t))))
    return "its prerequisite chain doesn't fit before graduation";
  return "no remaining semester has room";
}
