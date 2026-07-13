import { z } from "zod";

// ---------------------------------------------------------------------------
// Semesters & terms
// ---------------------------------------------------------------------------

export const TERMS = ["fall", "spring"] as const;
export type Term = (typeof TERMS)[number];

export const SEMESTER_IDS = [
  "Y1F",
  "Y1S",
  "Y2F",
  "Y2S",
  "Y3F",
  "Y3S",
  "Y4F",
  "Y4S",
] as const;
export type SemesterId = (typeof SEMESTER_IDS)[number];

export const SemesterIdSchema = z.enum(SEMESTER_IDS);

/** Chronological position of a semester (0 = Year 1 Fall). */
export function semesterIndex(id: SemesterId): number {
  return SEMESTER_IDS.indexOf(id);
}

export function semesterYear(id: SemesterId): number {
  return Number(id[1]);
}

export function semesterTerm(id: SemesterId): Term {
  return id.endsWith("F") ? "fall" : "spring";
}

export function semesterLabel(id: SemesterId): string {
  return `Year ${semesterYear(id)} · ${semesterTerm(id) === "fall" ? "Fall" : "Spring"}`;
}

/** Calendar year a semester falls in, given the year the student entered. */
export function semesterCalendarYear(id: SemesterId, startYear: number): number {
  const year = semesterYear(id);
  return semesterTerm(id) === "fall" ? startYear + year - 1 : startYear + year;
}

/** Real term name, e.g. "Fall 2025" — the primary wayfinding label. */
export function semesterTermName(id: SemesterId, startYear: number): string {
  const term = semesterTerm(id) === "fall" ? "Fall" : "Spring";
  return `${term} ${semesterCalendarYear(id, startYear)}`;
}

/** Disambiguated label for menus/lists, e.g. "Fall 2025 · Year 1". */
export function semesterFullLabel(id: SemesterId, startYear: number): string {
  return `${semesterTermName(id, startYear)} · Year ${semesterYear(id)}`;
}

// ---------------------------------------------------------------------------
// Requirement rules — the heart of the modular program schema.
// A category is satisfied by completing ALL listed courses (allOf),
// N courses from a pool (chooseN), or a minimum number of credits
// from a pool (creditsFrom).
// ---------------------------------------------------------------------------

export const RuleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("allOf"),
    courses: z.array(z.string()).min(1),
  }),
  z.object({
    kind: z.literal("chooseN"),
    n: z.number().int().positive(),
    courses: z.array(z.string()).min(1),
  }),
  z.object({
    kind: z.literal("creditsFrom"),
    minCredits: z.number().positive(),
    courses: z.array(z.string()).min(1),
  }),
]);
export type Rule = z.infer<typeof RuleSchema>;

export const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Capstone categories trigger senior-year placement checks. */
  isCapstone: z.boolean().optional().default(false),
  rule: RuleSchema,
});
export type Category = z.infer<typeof CategorySchema>;

export const ProgramSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Short label used on rings and badges, e.g. "CS". */
  shortName: z.string(),
  /**
   * - "core" (NYUSH Core) and "minor" programs always receive credit from a
   *   course's fulfillments — they pass through, no allocation toggle.
   * - "major" programs are subject to the cross-listing allocation toggle and
   *   the double-count budget (only majors compete for a shared course).
   */
  type: z.enum(["major", "core", "minor"]),
  /** CSS color used for this program's ring and badges. */
  color: z.string(),
  /** Max courses that may double count between this major and another. */
  doubleCountLimit: z.number().int().nonnegative().optional(),
  categories: z.array(CategorySchema).min(1),
});
export type Program = z.infer<typeof ProgramSchema>;

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export const FulfillmentSchema = z.object({
  programId: z.string(),
  categoryId: z.string(),
});
export type Fulfillment = z.infer<typeof FulfillmentSchema>;

export const CourseSchema = z.object({
  /** Official course code, e.g. "CSCI-SHU 210" — used as the primary key. */
  id: z.string().min(1),
  title: z.string().min(1),
  credits: z.number().positive(),
  department: z.string(),
  /** Optional catalog description (populated by the AI importer). */
  description: z.string().optional(),
  /**
   * Prerequisites as AND-of-ORs: every inner array is one requirement,
   * satisfied by any one of its course ids.
   * [["CSCI-SHU 101", "CSCI-SHU 11"]] = "Intro to CS or Intro to Programming".
   */
  prereqs: z.array(z.array(z.string()).min(1)).optional().default([]),
  /** Terms in which the course is typically offered. */
  offered: z.array(z.enum(TERMS)).min(1),
  /** Site ids (see sites.json) where the course can be taken. */
  sites: z.array(z.string()).min(1),
  /**
   * Which program categories this course can satisfy. Entries in two or
   * more *major* programs make the course cross-listed (allocation toggle).
   */
  fulfills: z.array(FulfillmentSchema).optional().default([]),
  /**
   * Course ids this course substitutes for (e.g. Honors Calculus ≡
   * MATH-SHU 131): it satisfies their slots in allOf rules, their spots in
   * chooseN/creditsFrom pools, and prerequisites that ask for them.
   */
  equivalentTo: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
});
export type Course = z.infer<typeof CourseSchema>;

/** True when `course` stands in for `targetId` (itself or an equivalent). */
export function courseCovers(course: Course, targetId: string): boolean {
  // `?? []` guards courses rehydrated before `equivalentTo` existed.
  return course.id === targetId || (course.equivalentTo ?? []).includes(targetId);
}

// ---------------------------------------------------------------------------
// Grades & special rules
// ---------------------------------------------------------------------------

/** Letter grades, best → worst. Index = rank (A = 0). */
export const GRADES = [
  "A",
  "A-",
  "B+",
  "B",
  "B-",
  "C+",
  "C",
  "C-",
  "D+",
  "D",
  "D-",
  "F",
] as const;
export type Grade = (typeof GRADES)[number];

export const GradeSchema = z.enum(GRADES);

/** True when `grade` is at least `min` (e.g. "A-" meets a "B+" minimum). */
export function gradeAtLeast(grade: Grade, min: Grade): boolean {
  return GRADES.indexOf(grade) <= GRADES.indexOf(min);
}

/**
 * Admin-authored special rules the deterministic engines consult. The rule
 * set is data (DB-backed, Phase 4 agent authors it); the engines stay
 * authoritative. Extensible via the discriminated union.
 *
 * - equivalence: `course` counts wherever `target` is required (like a
 *   per-course equivalentTo, but managed centrally).
 * - concurrentPrereq: `course` may be taken in the SAME term as its `prereq`
 *   (instead of strictly after), optionally gated on a grade in `condition`
 *   (e.g. Data Structures + Intro CS together if you earned A in ICP).
 */
export const SpecialRuleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("equivalence"),
    id: z.string(),
    course: z.string(),
    target: z.string(),
    note: z.string().optional(),
  }),
  z.object({
    kind: z.literal("concurrentPrereq"),
    id: z.string(),
    course: z.string(),
    prereq: z.string(),
    condition: z
      .object({ course: z.string(), minGrade: GradeSchema })
      .optional(),
    note: z.string().optional(),
  }),
]);
export type SpecialRule = z.infer<typeof SpecialRuleSchema>;

// ---------------------------------------------------------------------------
// Study-away sites
// ---------------------------------------------------------------------------

export const SiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Short badge label, e.g. "NYUNY". */
  label: z.string(),
  isHome: z.boolean().optional().default(false),
});
export type Site = z.infer<typeof SiteSchema>;

// ---------------------------------------------------------------------------
// Planner state primitives (persisted by the Zustand store)
// ---------------------------------------------------------------------------

/**
 * How a cross-listed course is credited:
 *  - "auto":  the engine picks the major that needs it most
 *  - "split": counts toward every cross-listed major (uses double-count budget)
 *  - any other string: a specific program id it counts toward exclusively
 */
export type Allocation = "auto" | "split" | (string & {});

export interface Placement {
  courseId: string;
  semesterId: SemesterId;
  allocation: Allocation;
  /** Optional self-reported expected grade — drives grade-conditional rules. */
  expectedGrade?: Grade;
}

export interface PlanSnapshot {
  version: 1;
  placements: Placement[];
  studyAway: Partial<Record<SemesterId, string>>;
  completedSemesters: SemesterId[];
  activePrograms: string[];
  /** Courses added by the user (AI importer); merged over the static catalog. */
  customCourses: Course[];
  /** Warning ids the user acknowledged and hid. */
  dismissedWarnings: string[];
  /** Calendar year of the student's first fall semester (e.g. 2025). */
  startYear: number;
}

// ---------------------------------------------------------------------------
// Derived results (never stored — computed by lib/validation, lib/progress)
// ---------------------------------------------------------------------------

export type WarningKind =
  | "prereq-missing"
  | "prereq-concurrent"
  | "not-offered"
  | "site-unavailable"
  | "overload"
  | "underload"
  | "capstone-early"
  | "double-count-exceeded";

export interface PlanWarning {
  /** Stable key, e.g. "prereq-missing:CSCI-SHU 210:Y1F". */
  id: string;
  kind: WarningKind;
  severity: "error" | "warning";
  courseId?: string;
  semesterId?: SemesterId;
  message: string;
}

export interface CategoryProgress {
  programId: string;
  categoryId: string;
  name: string;
  isCapstone: boolean;
  /** Denominator units: course count (allOf/chooseN) or credits (creditsFrom). */
  requiredUnits: number;
  unitKind: "courses" | "credits";
  /** Units earned in semesters marked completed. */
  completedUnits: number;
  /** Units covered by the whole plan (completed + future semesters). */
  plannedUnits: number;
  /** Course ids currently credited to this category. */
  matchedCourseIds: string[];
  /** For allOf rules: course ids still missing from the plan. */
  missingCourseIds: string[];
}

export interface ProgramProgress {
  programId: string;
  /** 0..1, weighted across categories by requiredUnits. */
  plannedFraction: number;
  completedFraction: number;
  categories: CategoryProgress[];
}
