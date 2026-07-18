"use client";

import { useMemo } from "react";
import { useCatalog } from "@/components/CatalogProvider";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import { CourseSchema, type Course } from "@/lib/types";
import { usePlannerStore } from "@/store/plannerStore";

/** Adapts source-scoped catalog records to the official-code degree engines. */
export function useCourseData() {
  const customCourses = usePlannerStore((state) => state.customCourses);
  const catalog = useCatalog();

  return useMemo(() => {
    const records: CatalogCourseRecord[] = [...catalog.recordsByStableId.values()];
    const courseByStableId = new Map<string, Course>(
      records.map((record) => [record.stableId, record.course]),
    );
    const coursesByOfficialCode = new Map<string, Course[]>();
    records.forEach((record) => {
      coursesByOfficialCode.set(record.code, [
        ...(coursesByOfficialCode.get(record.code) ?? []),
        record.course,
      ]);
    });

    const coursesById = new Map<string, Course>();
    coursesByOfficialCode.forEach((courses, code) => {
      if (courses.length === 1) coursesById.set(code, courses[0]);
    });

    const customIds = new Set<string>();
    const validCustomCourses: Course[] = [];
    for (const raw of customCourses) {
      const parsed = CourseSchema.safeParse(raw);
      if (!parsed.success) continue;
      validCustomCourses.push(parsed.data);
      customIds.add(parsed.data.id);
      coursesById.set(parsed.data.id, parsed.data);
      coursesByOfficialCode.set(parsed.data.id, [parsed.data]);
    }

    const courses = [
      ...records
        .filter((record) => !customIds.has(record.code))
        .map((record) => record.course),
      ...validCustomCourses,
    ];

    return {
      records,
      courses,
      courseByStableId,
      coursesByOfficialCode,
      coursesById,
      customIds,
      programs: catalog.programs,
      programsById: catalog.programsById,
      snapshot: catalog.snapshot,
      rules: catalog.rules,
      loaded: catalog.loaded,
      status: catalog.status,
      error: catalog.error,
    };
  }, [catalog, customCourses]);
}
