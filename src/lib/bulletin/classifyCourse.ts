import type { SourceCourse } from "@/lib/bulletin/parseCoursePage";

export type CourseLevelDecision =
  | { level: "undergraduate"; reason: string }
  | { level: "graduate"; reason: string }
  | { level: "ambiguous"; reason: string };

const UNDERGRADUATE_CODE = /-(?:UA|UB|UC|UF|UH|UN|UY)\s+\d/i;
const GRADUATE_CODE = /-(?:GA|GB|GC|GF|GH|GN|GY)\s+\d/i;

export function classifyCourseLevel(course: SourceCourse): CourseLevelDecision {
  const explicit = course.levelText?.trim() ?? "";
  if (/\bundergraduate\b/i.test(explicit)) {
    return { level: "undergraduate", reason: "explicit-level" };
  }
  if (/\bgraduate\b/i.test(explicit)) {
    return { level: "graduate", reason: "explicit-level" };
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
