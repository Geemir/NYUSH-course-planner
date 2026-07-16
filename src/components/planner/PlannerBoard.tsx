"use client";

import { GraduationCap } from "lucide-react";
import { SemesterColumn } from "@/components/planner/SemesterColumn";
import { Badge } from "@/components/ui/badge";
import { SemesterId } from "@/lib/types";
import { usePlannerStore } from "@/store/plannerStore";

const YEAR_LABELS = ["Freshman", "Sophomore", "Junior", "Senior"];

export function PlannerBoard({
  onSelectCourse,
}: {
  onSelectCourse: (courseId: string) => void;
}) {
  const startYear = usePlannerStore((s) => s.startYear);

  return (
    <div className="flex flex-col gap-10">
      {[1, 2, 3, 4].map((year) => {
        const fallYear = startYear + year - 1;
        return (
          <section
            key={year}
            data-testid={`year-${year}`}
            aria-labelledby={`year-${year}-heading`}
            className="flex flex-col gap-3"
          >
            <header className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground shadow-sm">
                {year}
              </span>
              <div className="flex min-w-28 flex-col gap-0.5">
                <h2
                  id={`year-${year}-heading`}
                  className="text-base leading-5 font-semibold"
                >
                  Year {year}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {YEAR_LABELS[year - 1]}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {fallYear}–{(fallYear + 1) % 100}
                </span>
              </div>
              <div className="h-px min-w-6 flex-1 bg-border" aria-hidden="true" />
              {year === 4 && (
                <Badge
                  variant="outline"
                  className="gap-1 px-2 text-xs"
                >
                  <GraduationCap className="size-3.5" aria-hidden="true" />
                  Capstone
                </Badge>
              )}
            </header>
            <div className="flex flex-col gap-3">
              <SemesterColumn
                semesterId={`Y${year}F` as SemesterId}
                onSelectCourse={onSelectCourse}
              />
              <SemesterColumn
                semesterId={`Y${year}S` as SemesterId}
                onSelectCourse={onSelectCourse}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
