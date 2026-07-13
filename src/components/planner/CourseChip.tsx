"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, AlertTriangle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import { PROGRAMS_BY_ID, isActivelyCrossListed } from "@/lib/data";
import { cn } from "@/lib/utils";
import { usePlannerStore } from "@/store/plannerStore";

export function CourseChip({
  courseId,
  onSelect,
}: {
  courseId: string;
  onSelect: (courseId: string) => void;
}) {
  const {
    warningsByCourse,
    effectiveMajors,
    placementByCourse,
    coursesById,
  } = usePlanDerived();
  const removeCourse = usePlannerStore((s) => s.removeCourse);
  const completedSemesters = usePlannerStore((s) => s.completedSemesters);
  const activePrograms = usePlannerStore((s) => s.activePrograms);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: `chip:${courseId}` });

  const course = coursesById.get(courseId);
  if (!course) return null;

  const warnings = warningsByCourse.get(courseId) ?? [];
  const hasError = warnings.some((w) => w.severity === "error");
  const placement = placementByCourse.get(courseId);
  const isDone =
    placement !== undefined &&
    completedSemesters.includes(placement.semesterId);

  const cross = isActivelyCrossListed(course, activePrograms);
  const majors = effectiveMajors(courseId);
  const allocationLabel = cross
    ? majors
        .map((id) => PROGRAMS_BY_ID.get(id)?.shortName ?? id)
        .join("+") || "—"
    : null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Translate.toString(transform) }}
      onClick={() => onSelect(courseId)}
      data-testid={`chip-${courseId}`}
      className={cn(
        "group flex cursor-grab items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-left shadow-xs transition-colors duration-150 hover:border-primary/40 hover:bg-muted/50",
        warnings.length > 0 &&
          (hasError ? "border-destructive" : "border-amber-500"),
        isDone && "opacity-70",
        isDragging && "z-10 opacity-50",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-mono text-xs text-muted-foreground">
          {course.id}
        </span>
        <span className="truncate text-sm leading-tight font-medium">
          {course.title}
        </span>
      </div>
      {warnings.length > 0 && (
        <Tooltip>
          <TooltipTrigger
            render={<span className="flex shrink-0 items-center" />}
          >
            {hasError ? (
              <AlertCircle className="size-4 text-destructive" />
            ) : (
              <AlertTriangle className="size-4 text-amber-500" />
            )}
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex max-w-64 flex-col gap-1">
              {warnings.map((w) => (
                <span key={w.id}>{w.message}</span>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
      {allocationLabel && (
        <Badge variant="outline" className="shrink-0 px-1 text-[10px]">
          {allocationLabel}
        </Badge>
      )}
      {placement?.expectedGrade && (
        <Badge
          variant="secondary"
          className="shrink-0 px-1 text-[10px] font-semibold"
          title={`Expected grade: ${placement.expectedGrade}`}
        >
          {placement.expectedGrade}
        </Badge>
      )}
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {course.credits}cr
      </span>
      <button
        type="button"
        aria-label={`Remove ${course.id}`}
        className="hidden shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive group-hover:block"
        onClick={(e) => {
          e.stopPropagation();
          removeCourse(courseId);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
