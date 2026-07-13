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
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
      {[1, 2, 3, 4].map((year) => {
        const fallYear = startYear + year - 1;
        return (
          <section
            key={year}
            data-testid={`year-${year}`}
            className="flex flex-col gap-2.5 rounded-2xl border bg-muted/30 p-3"
          >
            <header className="flex items-center gap-2.5 px-0.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
                {year}
              </span>
              <div className="flex min-w-0 flex-col">
                <h3 className="text-base leading-tight font-semibold">
                  Year {year}
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    {YEAR_LABELS[year - 1]}
                  </span>
                </h3>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {fallYear}–{(fallYear + 1) % 100}
                </span>
              </div>
              {year === 4 && (
                <Badge
                  variant="outline"
                  className="ml-auto gap-1 px-1.5 text-xs"
                >
                  <GraduationCap className="size-3.5" />
                  Capstone
                </Badge>
              )}
            </header>
            <SemesterColumn
              semesterId={`Y${year}F` as SemesterId}
              onSelectCourse={onSelectCourse}
            />
            <SemesterColumn
              semesterId={`Y${year}S` as SemesterId}
              onSelectCourse={onSelectCourse}
            />
          </section>
        );
      })}
    </div>
  );
}
