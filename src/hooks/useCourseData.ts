"use client";

import { useMemo } from "react";
import { useCatalog } from "@/components/CatalogProvider";
import { Course, CourseSchema } from "@/lib/types";
import { usePlannerStore } from "@/store/plannerStore";

/**
 * The live course catalog: built-in courses merged with user-added custom
 * courses (custom entries override built-ins with the same id).
 *
 * Custom courses are re-parsed through CourseSchema so that fields added to
 * the schema after a course was saved (e.g. `equivalentTo`) get their
 * defaults. Zustand's localStorage rehydration restores raw JSON and does NOT
 * re-run Zod, so without this a course saved by an older app version would be
 * missing newer array fields and crash code that reads them.
 */
export function useCourseData() {
  const customCourses = usePlannerStore((s) => s.customCourses);
  const {
    courses: catalog,
    programs,
    programsById,
    snapshot,
    rules,
    loaded,
  } = useCatalog();

  return useMemo(() => {
    const coursesById = new Map<string, Course>(catalog.map((c) => [c.id, c]));
    const customIds = new Set<string>();
    for (const raw of customCourses) {
      const parsed = CourseSchema.safeParse(raw);
      if (!parsed.success) continue; // drop malformed legacy entries
      coursesById.set(parsed.data.id, parsed.data);
      customIds.add(parsed.data.id);
    }
    return {
      courses: [...coursesById.values()],
      coursesById,
      customIds,
      programs,
      programsById,
      snapshot,
      rules,
      loaded,
    };
  }, [customCourses, catalog, loaded, programs, programsById, rules, snapshot]);
}
