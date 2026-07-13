import {
  Course,
  GradeSchema,
  SpecialRule,
  SpecialRuleSchema,
} from "@/lib/types";

export class RuleParseError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

export interface ParsedRule {
  rule: SpecialRule;
  explanation: string;
  /** Non-fatal notes, e.g. a referenced course code not (yet) in the catalog. */
  issues: string[];
}

/**
 * Validates a raw model object into a SpecialRule. Pure (no network / no
 * server-only deps) so it can be unit-tested. Unknown course codes are
 * returned as non-fatal `issues`; structurally invalid rules throw.
 */
export function sanitizeRule(
  raw: Record<string, unknown>,
  courses: Course[],
): ParsedRule {
  const known = new Set(courses.map((c) => c.id));
  const issues: string[] = [];
  const code = (v: unknown) => String(v ?? "").trim();
  const checkCode = (c: string, label: string) => {
    if (c && !known.has(c)) issues.push(`${label} "${c}" is not in the catalog`);
  };
  const explanation =
    typeof raw.explanation === "string" ? raw.explanation.trim() : "";
  const note =
    typeof raw.note === "string" && raw.note.trim()
      ? raw.note.trim()
      : undefined;

  let candidate: Record<string, unknown>;
  if (raw.kind === "equivalence") {
    const course = code(raw.course);
    const target = code(raw.target);
    if (!course || !target) {
      throw new RuleParseError(
        "Could not identify both courses for the equivalence.",
      );
    }
    checkCode(course, "Course");
    checkCode(target, "Target");
    candidate = {
      kind: "equivalence",
      id: crypto.randomUUID(),
      course,
      target,
      note,
    };
  } else if (raw.kind === "concurrentPrereq") {
    const course = code(raw.course);
    const prereq = code(raw.prereq);
    if (!course || !prereq) {
      throw new RuleParseError(
        "Could not identify both the course and its prerequisite.",
      );
    }
    checkCode(course, "Course");
    checkCode(prereq, "Prerequisite");
    let condition: { course: string; minGrade: string } | undefined;
    const rawCond = raw.condition as
      | { course?: unknown; minGrade?: unknown }
      | null
      | undefined;
    if (rawCond && typeof rawCond === "object") {
      const condCourse = code(rawCond.course);
      const grade = GradeSchema.safeParse(rawCond.minGrade);
      if (condCourse && grade.success) {
        checkCode(condCourse, "Condition course");
        condition = { course: condCourse, minGrade: grade.data };
      }
    }
    candidate = {
      kind: "concurrentPrereq",
      id: crypto.randomUUID(),
      course,
      prereq,
      condition,
      note,
    };
  } else {
    throw new RuleParseError(
      explanation ||
        "The description doesn't match a supported rule (equivalence or concurrent prerequisite).",
    );
  }

  const parsed = SpecialRuleSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new RuleParseError(
      `Could not build a valid rule: ${parsed.error.issues[0]?.message ?? "unknown issue"}`,
    );
  }
  return { rule: parsed.data, explanation, issues };
}
