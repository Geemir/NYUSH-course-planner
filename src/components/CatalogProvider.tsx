"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { COURSES } from "@/lib/data";
import { Course, CourseSchema, SpecialRule, SpecialRuleSchema } from "@/lib/types";

interface CatalogValue {
  /** The shared catalog: DB-backed once loaded, bundled JSON until then. */
  courses: Course[];
  /** Active special rules from the DB (empty until loaded). */
  rules: SpecialRule[];
  /** True once the DB catalog has replaced the bundled fallback. */
  loaded: boolean;
}

const CatalogContext = createContext<CatalogValue>({
  courses: COURSES,
  rules: [],
  loaded: false,
});

/**
 * Supplies the shared course catalog to the client. Renders immediately with
 * the bundled JSON (so the planner works offline / before the fetch), then
 * swaps in the DB catalog from /api/catalog. Per-user custom courses are still
 * merged on top in useCourseData.
 */
export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [courses, setCourses] = useState<Course[]>(COURSES);
  const [rules, setRules] = useState<SpecialRule[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/catalog");
        if (!res.ok || !active) return;
        const data = (await res.json()) as { courses: unknown; rules: unknown };
        const parsedCourses = CourseSchema.array().safeParse(data.courses);
        const parsedRules = SpecialRuleSchema.array().safeParse(data.rules);
        if (parsedCourses.success && parsedCourses.data.length > 0 && active) {
          setCourses(parsedCourses.data);
          setRules(parsedRules.success ? parsedRules.data : []);
          setLoaded(true);
        }
      } catch {
        /* keep bundled fallback */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <CatalogContext.Provider value={{ courses, rules, loaded }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogValue {
  return useContext(CatalogContext);
}
