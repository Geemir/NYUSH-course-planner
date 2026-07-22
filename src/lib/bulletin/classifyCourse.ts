import type { SourceCourse } from "@/lib/bulletin/parseCoursePage";

export type CourseLevelDecision =
  | { level: "undergraduate"; reason: string }
  | { level: "graduate"; reason: string }
  | { level: "ambiguous"; reason: string };

/**
 * NYU school code suffixes. UA College of Arts & Science, UB Stern,
 * UC SPS/continuing, UD Dentistry, UE Steinhardt, UF Liberal Studies,
 * UG Gallatin, UH public health (legacy), UN Nursing, US Silver Social Work,
 * UT Tisch, UY Tandon — with the G* graduate counterparts. Suffix-sharing
 * schools (Wagner -GP, Global Public Health -GU) are disambiguated by their
 * undergraduate subject prefixes below. A wrong guess fails closed: graduate
 * records error the snapshot and ambiguous records are quarantined.
 */
const UNDERGRADUATE_CODE = /-(?:UA|UB|UC|UD|UE|UF|UG|UH|UN|US|UT|UY)\s+\d/i;
const GRADUATE_CODE = /-(?:GA|GB|GC|GD|GE|GF|GG|GH|GN|GS|GT|GY)\s+\d/i;
/** Undergraduate subjects at schools whose suffix is shared with graduate. */
const UNDERGRADUATE_SUBJECT = /^(?:UPADM-GP|UGPH-GU)\s+\d/i;

export function classifyCourseLevel(course: SourceCourse): CourseLevelDecision {
  const explicit = course.levelText?.trim() ?? "";
  if (/\bundergraduate\b/i.test(explicit)) {
    return { level: "undergraduate", reason: "explicit-level" };
  }
  if (/\bgraduate\b/i.test(explicit)) {
    return { level: "graduate", reason: "explicit-level" };
  }

  if (UNDERGRADUATE_SUBJECT.test(course.code)) {
    return { level: "undergraduate", reason: "tested-code-convention" };
  }
  if (UNDERGRADUATE_CODE.test(course.code)) {
    return { level: "undergraduate", reason: "tested-code-convention" };
  }
  if (GRADUATE_CODE.test(course.code)) {
    return { level: "graduate", reason: "tested-code-convention" };
  }
  if (course.sourceId === "nyu-shanghai" && /-SHU\s+\d/i.test(course.code)) {
    return { level: "undergraduate", reason: "tested-code-convention" };
  }

  return { level: "ambiguous", reason: "no-reliable-level-signal" };
}
