import { z } from "zod";
import { COURSES_BY_ID, PROGRAMS_BY_ID } from "@/lib/data";
import {
  Course,
  CourseSchema,
  PlanSnapshot,
  SEMESTER_IDS,
  SemesterId,
} from "@/lib/types";

const SemesterIdSchema = z.enum(SEMESTER_IDS);

const SnapshotSchema = z.object({
  version: z.literal(1),
  placements: z.array(
    z.object({
      courseId: z.string(),
      semesterId: SemesterIdSchema,
      allocation: z.string(),
    }),
  ),
  studyAway: z.record(z.string(), z.string()).optional().default({}),
  completedSemesters: z.array(SemesterIdSchema).optional().default([]),
  activePrograms: z.array(z.string()),
  customCourses: z.array(z.unknown()).optional().default([]),
  dismissedWarnings: z.array(z.string()).optional().default([]),
  startYear: z.number().int().min(2015).max(2040).optional().default(2025),
});

/**
 * Parses an exported plan file, dropping references to courses/programs
 * that no longer exist in the data files (e.g. after editing courses.json).
 */
export function parsePlan(text: string): PlanSnapshot {
  const parsed = SnapshotSchema.parse(JSON.parse(text));

  const customCourses: Course[] = [];
  for (const raw of parsed.customCourses) {
    const result = CourseSchema.safeParse(raw);
    if (result.success) customCourses.push(result.data);
  }
  const knownIds = new Set([
    ...COURSES_BY_ID.keys(),
    ...customCourses.map((c) => c.id),
  ]);

  const placements = parsed.placements.filter((p) => knownIds.has(p.courseId));

  const studyAway: Partial<Record<SemesterId, string>> = {};
  for (const [key, value] of Object.entries(parsed.studyAway)) {
    if ((SEMESTER_IDS as readonly string[]).includes(key)) {
      studyAway[key as SemesterId] = value;
    }
  }

  const activePrograms = parsed.activePrograms.filter((id) =>
    PROGRAMS_BY_ID.has(id),
  );

  return {
    version: 1,
    placements,
    studyAway,
    completedSemesters: parsed.completedSemesters,
    activePrograms:
      activePrograms.length > 0 ? activePrograms : [...PROGRAMS_BY_ID.keys()],
    customCourses,
    dismissedWarnings: parsed.dismissedWarnings,
    startYear: parsed.startYear,
  };
}

export function downloadPlan(snapshot: PlanSnapshot) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nyush-plan.json";
  a.click();
  URL.revokeObjectURL(url);
}
