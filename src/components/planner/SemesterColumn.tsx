"use client";

import { useDroppable } from "@dnd-kit/core";
import { GraduationCap, Leaf, Sprout } from "lucide-react";
import { CourseChip } from "@/components/planner/CourseChip";
import { StudyAwaySelect } from "@/components/planner/StudyAwaySelect";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import { cn } from "@/lib/utils";
import { SemesterId, semesterTerm, semesterTermName } from "@/lib/types";
import {
  MAX_SEMESTER_CREDITS,
  MIN_SEMESTER_CREDITS,
} from "@/lib/validation";
import { usePlannerStore } from "@/store/plannerStore";

export function SemesterColumn({
  semesterId,
  onSelectCourse,
}: {
  semesterId: SemesterId;
  onSelectCourse: (courseId: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: semesterId });
  const { placementsBySemester, creditsBySemester, coursesById } =
    usePlanDerived();
  const completed = usePlannerStore((s) =>
    s.completedSemesters.includes(semesterId),
  );
  const toggleCompleted = usePlannerStore((s) => s.toggleCompletedSemester);
  const startYear = usePlannerStore((s) => s.startYear);
  const isFall = semesterTerm(semesterId) === "fall";

  const placements = placementsBySemester.get(semesterId) ?? [];
  const credits = creditsBySemester.get(semesterId) ?? 0;
  const overloaded = credits > MAX_SEMESTER_CREDITS;
  const underloaded = credits > 0 && credits < MIN_SEMESTER_CREDITS;
  const hasCapstone = placements.some((p) =>
    coursesById.get(p.courseId)?.tags.includes("capstone"),
  );

  return (
    <div
      ref={setNodeRef}
      data-testid={`semester-${semesterId}`}
      className={cn(
        "flex min-h-44 flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-shadow duration-150",
        isOver && "ring-2 ring-primary/60",
        completed && "bg-muted/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {isFall ? (
            <Leaf className="size-4 text-amber-500" />
          ) : (
            <Sprout className="size-4 text-emerald-500" />
          )}
          {semesterTermName(semesterId, startYear)}
          {completed && (
            <Badge
              variant="outline"
              className="border-emerald-500/50 px-1 text-[10px] text-emerald-600 dark:text-emerald-400"
            >
              done
            </Badge>
          )}
          {hasCapstone && (
            <GraduationCap className="size-4 text-emerald-600 dark:text-emerald-400" />
          )}
        </span>
        <Badge
          variant={overloaded ? "destructive" : "secondary"}
          className={cn(
            "px-1.5 text-xs tabular-nums",
            underloaded && "text-amber-600 dark:text-amber-400",
          )}
          title={
            overloaded
              ? `Above the ${MAX_SEMESTER_CREDITS}-credit limit`
              : underloaded
                ? `Below the ${MIN_SEMESTER_CREDITS}-credit full-time minimum`
                : undefined
          }
        >
          {credits} cr
        </Badge>
      </div>

      <div className="flex items-center justify-between gap-2">
        <StudyAwaySelect semesterId={semesterId} />
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox
            checked={completed}
            onCheckedChange={() => toggleCompleted(semesterId)}
            aria-label={`Mark ${semesterId} as completed`}
            className="size-4"
          />
          Done
        </label>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {placements.map((p) => (
          <CourseChip
            key={p.courseId}
            courseId={p.courseId}
            onSelect={onSelectCourse}
          />
        ))}
        {placements.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Add courses from the catalog or use Add to semester.
          </div>
        )}
      </div>
    </div>
  );
}
