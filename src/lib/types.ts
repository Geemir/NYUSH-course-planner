import { z } from "zod";
import {
  BulletinDiagnosticSchema,
  BulletinRequirementDocumentSchema,
  BulletinSamplePlanSchema,
} from "@/lib/bulletin/displayTypes";

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

export type RequirementNode =
  | { kind: "course"; courseId: string }
  | { kind: "all"; children: RequirementNode[] }
  | { kind: "any"; children: RequirementNode[] }
  | { kind: "choose"; count: number; children: RequirementNode[] }
  | { kind: "credits"; minimum: number; children: RequirementNode[] }
  | { kind: "attribute"; attribute: string }
  | { kind: "exclusion"; excludedCourseIds: string[]; child: RequirementNode }
  | { kind: "waiver"; waiverId: string; label: string }
  | { kind: "manualConfirmation"; label: string; sourceText: string };

export const RequirementNodeSchema: z.ZodType<RequirementNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("course"), courseId: z.string().min(1) }),
    z.object({
      kind: z.literal("all"),
      children: z.array(RequirementNodeSchema).min(1),
    }),
    z.object({
      kind: z.literal("any"),
      children: z.array(RequirementNodeSchema).min(1),
    }),
    z.object({
      kind: z.literal("choose"),
      count: z.number().int().positive(),
      children: z.array(RequirementNodeSchema).min(1),
    }),
    z.object({
      kind: z.literal("credits"),
      minimum: z.number().positive(),
      children: z.array(RequirementNodeSchema).min(1),
    }),
    z.object({ kind: z.literal("attribute"), attribute: z.string().min(1) }),
    z.object({
      kind: z.literal("exclusion"),
      excludedCourseIds: z.array(z.string()),
      child: RequirementNodeSchema,
    }),
    z.object({
      kind: z.literal("waiver"),
      waiverId: z.string().min(1),
      label: z.string().min(1),
    }),
    z.object({
      kind: z.literal("manualConfirmation"),
      label: z.string().min(1),
      sourceText: z.string().min(1),
    }),
  ]),
);

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

export const CatalogProvenanceSchema = z.object({
  sourceUrl: z.string().url(),
  snapshotId: z.string().min(1),
  sourceHash: z.string().min(1),
});
export type CatalogProvenance = z.infer<typeof CatalogProvenanceSchema>;

export const CourseSchema = z.object({
  /** Official course code, e.g. "CSCI-SHU 210" — used as the primary key. */
  id: z.string().min(1),
  title: z.string().min(1),
  credits: z.number().nonnegative(),
  minCredits: z.number().nonnegative().optional(),
  maxCredits: z.number().nonnegative().optional(),
  creditsText: z.string().optional(),
  department: z.string(),
  /** Optional catalog description (populated by the AI importer). */
  description: z.string().optional(),
  /**
   * Prerequisites as AND-of-ORs: every inner array is one requirement,
   * satisfied by any one of its course ids.
   * [["CSCI-SHU 101", "CSCI-SHU 11"]] = "Intro to CS or Intro to Programming".
   */
  prereqs: z.array(z.array(z.string()).min(1)).optional().default([]),
  prerequisiteText: z.string().optional(),
  /** All parser-linked course references, including ambiguous prerequisites. */
  sourceReferenceIds: z.array(z.string()).optional().default([]),
  /** Terms in which the course is typically offered. */
  offered: z.array(z.enum(TERMS)),
  offeringText: z.string().optional(),
  offeringKnown: z.boolean().optional().default(true),
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
  attributes: z.array(z.string()).optional().default([]),
  provenance: CatalogProvenanceSchema.optional(),
  tags: z.array(z.string()).optional().default([]),
}).refine((course) => !course.offeringKnown || course.offered.length > 0, {
  message: "Known course offerings must include at least one term",
  path: ["offered"],
});
type ParsedCourse = z.infer<typeof CourseSchema>;
export type Course = Omit<
  ParsedCourse,
  "attributes" | "offeringKnown" | "sourceReferenceIds"
> & {
  attributes?: string[];
  offeringKnown?: boolean;
  sourceReferenceIds?: string[];
};

// ---------------------------------------------------------------------------
// Bulletin catalog candidates
// ---------------------------------------------------------------------------

export const CatalogRequirementRowSchema = z.object({
  sourceUrl: z.string().url(),
  tableId: z.string().min(1),
  sourceIndex: z.number().int().nonnegative(),
  sourceText: z.string().min(1),
  categoryId: z.string().min(1),
  nodePath: z.array(z.number().int().nonnegative()),
  node: RequirementNodeSchema,
});
export type CatalogRequirementRow = z.infer<
  typeof CatalogRequirementRowSchema
>;

export const CatalogSourceRowSchema = z.discriminatedUnion("representation", [
  z.object({
    representation: z.literal("categoryBoundary"),
    sourceUrl: z.string().url(),
    tableId: z.string().min(1),
    sourceIndex: z.number().int().nonnegative(),
    sourceText: z.string().min(1),
    categoryId: z.string().min(1),
  }),
  z.object({
    representation: z.literal("requirementNode"),
    sourceUrl: z.string().url(),
    tableId: z.string().min(1),
    sourceIndex: z.number().int().nonnegative(),
    sourceText: z.string().min(1),
    categoryId: z.string().min(1),
    nodePath: z.array(z.number().int().nonnegative()),
  }),
  z.object({
    representation: z.literal("publishedTotal"),
    sourceUrl: z.string().url(),
    tableId: z.string().min(1),
    sourceIndex: z.number().int().nonnegative(),
    sourceText: z.string().min(1),
    creditsText: z.string().min(1).optional(),
  }),
]);
export type CatalogSourceRow = z.infer<typeof CatalogSourceRowSchema>;

export const CatalogCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  requirement: RequirementNodeSchema,
  sourceUrl: z.string().url(),
  sourceTableId: z.string().min(1),
  sourceRowIndexes: z.array(z.number().int().nonnegative()).min(1),
});
export type CatalogCategory = z.infer<typeof CatalogCategorySchema>;

export const CatalogRequirementInterpretationSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    status: z.enum(["verified", "unavailable"]),
    requirement: RequirementNodeSchema.nullable(),
    sourceTableIds: z.array(z.string().min(1)).min(1),
    sourceRowRefs: z.array(
      z
        .object({
          tableId: z.string().min(1),
          sourceIndex: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    diagnostics: z.array(BulletinDiagnosticSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "verified" && value.requirement === null) {
      context.addIssue({
        code: "custom",
        message: "Verified interpretations require an executable AST.",
        path: ["requirement"],
      });
    }
    if (value.status === "unavailable" && value.requirement !== null) {
      context.addIssue({
        code: "custom",
        message: "Unavailable interpretations cannot contain an executable AST.",
        path: ["requirement"],
      });
    }
  });
export type CatalogRequirementInterpretation = z.infer<
  typeof CatalogRequirementInterpretationSchema
>;

export const CatalogProgramAuditAuthoritySchema = z.enum([
  "nyush-bulletin",
  "reviewed-nyush-overlay",
  "raw-nyu-bulletin",
]);
export type CatalogProgramAuditAuthority = z.infer<
  typeof CatalogProgramAuditAuthoritySchema
>;

export const CatalogProgramProfileRoleSchema = z.enum([
  "core",
  "primaryMajor",
  "secondMajor",
  "minor",
]);
export type CatalogProgramProfileRole = z.infer<
  typeof CatalogProgramProfileRoleSchema
>;

function defaultProfileRoles(
  type: "major" | "core" | "minor",
): CatalogProgramProfileRole[] {
  if (type === "core") return ["core"];
  if (type === "minor") return ["minor"];
  return ["primaryMajor", "secondMajor"];
}

const CatalogProgramInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  type: z.enum(["major", "core", "minor"]),
  categories: z.array(CatalogCategorySchema),
  bulletinDisplay: BulletinRequirementDocumentSchema.optional(),
  interpretations: z.array(CatalogRequirementInterpretationSchema).optional(),
  samplePlan: BulletinSamplePlanSchema.optional(),
  requirementRows: z.array(CatalogRequirementRowSchema),
  sourceRows: z.array(CatalogSourceRowSchema),
  sourceReferenceIds: z.array(z.string()),
  provenance: CatalogProvenanceSchema,
  auditAuthority: CatalogProgramAuditAuthoritySchema.default("nyush-bulletin"),
  eligibleProfileRoles: z.array(CatalogProgramProfileRoleSchema).optional(),
  reviewedOverlayIds: z.array(z.string().min(1)).optional(),
  reviewedNotes: z.array(z.object({ note: z.string().min(1), sourceUrl: z.string().url(), overlayId: z.string().min(1) }).strict()).optional(),
});

export const CatalogProgramSchema = CatalogProgramInputSchema.transform(
  (program) => ({
    ...program,
    interpretations:
      program.interpretations ??
      program.categories.map((category) => ({
        id: category.id,
        name: category.name,
        status: "verified" as const,
        requirement: category.requirement,
        sourceTableIds: [category.sourceTableId],
        sourceRowRefs: category.sourceRowIndexes.map((sourceIndex) => ({
          tableId: category.sourceTableId,
          sourceIndex,
        })),
        diagnostics: [],
      })),
    eligibleProfileRoles:
      program.eligibleProfileRoles ??
      (program.auditAuthority === "raw-nyu-bulletin"
        ? []
        : defaultProfileRoles(program.type)),
  }),
);
export type CatalogProgram = z.infer<typeof CatalogProgramSchema>;

export const CatalogCandidateSchema = z.object({
  snapshotId: z.string().min(1),
  sourceHash: z.string().min(1),
  documents: z.array(z.unknown()),
  courses: z.array(CourseSchema),
  programs: z.array(CatalogProgramSchema),
  sourceReferenceIds: z.array(z.string().min(1)),
  externalCourseIds: z.array(z.string().min(1)),
  unresolvedCourseIds: z.array(z.string().min(1)),
});
export interface CatalogCandidate {
  snapshotId: string;
  sourceHash: string;
  documents: unknown[];
  courses: Course[];
  programs: CatalogProgram[];
  sourceReferenceIds: string[];
  externalCourseIds: string[];
  unresolvedCourseIds: string[];
}

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
  /** Student-selected credits for a variable-credit course. */
  selectedCredits?: number;
  /** Optional self-reported expected grade — drives grade-conditional rules. */
  expectedGrade?: Grade;
}

export const FulfillmentFactSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["waiver", "exam", "manualConfirmation"]),
  requirementId: z.string().min(1),
  label: z.string().min(1),
});
export type FulfillmentFact = z.infer<typeof FulfillmentFactSchema>;

export const FulfillmentFactsSchema = z
  .array(FulfillmentFactSchema)
  .optional()
  .default([]);

export const RequirementStatusOverrideSchema = z.object({
  programId: z.string().min(1),
  categoryId: z.string().min(1),
  status: z.enum(["planned", "completed"]),
}).strict();
export type RequirementStatusOverride = z.infer<typeof RequirementStatusOverrideSchema>;
export const RequirementStatusOverridesSchema = z
  .array(RequirementStatusOverrideSchema)
  .optional()
  .default([]);

export interface PlanSnapshotV1 {
  version: 1;
  placements: Placement[];
  studyAway: Partial<Record<SemesterId, string>>;
  completedSemesters: SemesterId[];
  activePrograms: string[];
  /** Courses added by the user (AI importer); merged over the static catalog. */
  customCourses: Course[];
  /** Non-course requirement evidence; absent legacy snapshots import as empty. */
  fulfillmentFacts?: FulfillmentFact[];
  /** Warning ids the user acknowledged and hid. */
  dismissedWarnings: string[];
  /** Calendar year of the student's first fall semester (e.g. 2025). */
  startYear: number;
}

/** Backwards-compatible name used by v1 engines until store migration lands. */
export type PlanSnapshot = PlanSnapshotV1;

export interface PlanPlacementV2 extends Placement {
  placementId: string;
  catalogCourseId?: string;
  titleSnapshot?: string;
}

export const PlanningSlotSchema = z
  .object({
    id: z.string().min(1),
    sourceKey: z.string().min(1),
    semesterId: SemesterIdSchema,
    label: z.string().min(1).max(200),
    credits: z.number().nonnegative().nullable(),
    source: z
      .object({
        kind: z.literal("bulletin-sample-plan"),
        programId: z.string().min(1),
        catalogReleaseId: z.string().min(1),
        sectionId: z.string().min(1),
        termSourceIndex: z.number().int().nonnegative(),
        rowSourceIndex: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type PlanningSlot = z.infer<typeof PlanningSlotSchema>;
export const PlanningSlotsSchema = z
  .array(PlanningSlotSchema)
  .optional()
  .default([]);

export interface PlanSnapshotV2 {
  version: 2;
  catalogReleaseId: string | null;
  placements: PlanPlacementV2[];
  planningSlots?: PlanningSlot[];
  studyAway: Partial<Record<SemesterId, string>>;
  completedSemesters: SemesterId[];
  programProfile: import("@/lib/programProfile").ProgramProfile;
  unresolvedProgramIds: string[];
  customCourses: Course[];
  fulfillmentFacts: FulfillmentFact[];
  requirementStatusOverrides?: RequirementStatusOverride[];
  dismissedWarnings: string[];
  startYear: number;
}

export type PersistedPlanSnapshot = PlanSnapshotV1 | PlanSnapshotV2;

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
  /** Raw engine values retained when a student adds a manual status. */
  calculatedCompletedUnits: number;
  calculatedPlannedUnits: number;
  /** Explicit student status; never presented as an official audit result. */
  manualStatus: "planned" | "completed" | null;
  /** Course ids currently credited to this category. */
  matchedCourseIds: string[];
  /** Deterministic course ids still missing from the plan. */
  missingCourseIds: string[];
  /** Non-deterministic or non-course evidence still requiring attention. */
  gaps: RequirementGap[];
  manualState: "none" | "pending" | "satisfied";
}

export type RequirementGap =
  | {
      kind: "manual";
      label: string;
      sourceText: string;
    }
  | {
      kind: "waiver";
      label: string;
      waiverId: string;
    }
  | {
      kind: "ambiguous";
      label: string;
      candidateCourseIds: string[];
    };

export interface ProgramProgress {
  programId: string;
  /** 0..1, weighted across categories by requiredUnits. */
  plannedFraction: number;
  completedFraction: number;
  categories: CategoryProgress[];
}
