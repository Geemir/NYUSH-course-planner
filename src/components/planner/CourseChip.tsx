"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, AlertTriangle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import { placementCredits } from "@/lib/credits";
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
  const setSelectedCredits = usePlannerStore(
    (state) => state.setSelectedCredits,
  );
  const completedSemesters = usePlannerStore((s) => s.completedSemesters);
  const activePrograms = usePlannerStore((s) => s.activePrograms);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: `chip:${courseId}` });

  const course = coursesById.get(courseId);
  if (!course) return null;

  const warnings = warningsByCourse.get(courseId) ?? [];
  const hasError = warnings.some((w) => w.severity === "error");
  const placement = placementByCourse.get(courseId);
  const minimumCredits = course.minCredits ?? course.credits;
  const maximumCredits = course.maxCredits ?? course.credits;
  const selectedCredits = placement
    ? placementCredits(placement, course)
    : course.credits;
  const creditOptions = Array.from(
    { length: Math.floor(maximumCredits - minimumCredits) + 1 },
    (_, index) => minimumCredits + index,
  );
  if (creditOptions.at(-1) !== maximumCredits) {
    creditOptions.push(maximumCredits);
  }
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
      style={{ transform: CSS.Translate.toString(transform) }}
      data-testid={`chip-${courseId}`}
      className={cn(
        "group flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-left shadow-xs transition-colors duration-150 hover:border-primary/40 hover:bg-muted/50",
        warnings.length > 0 &&
          (hasError ? "border-destructive" : "border-amber-500"),
        isDone && "opacity-70",
        isDragging && "z-10 opacity-50",
      )}
    >
      <div
        {...listeners}
        {...attributes}
        className="flex min-w-0 flex-1 cursor-grab items-center gap-2"
        onClick={() => onSelect(courseId)}
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
      </div>
      {maximumCredits > minimumCredits && placement ? (
        <Select
          value={String(selectedCredits)}
          onValueChange={(value) =>
            setSelectedCredits(courseId, Number(value))
          }
        >
          <SelectTrigger
            size="sm"
            aria-label={`Credits for ${course.id}`}
            className="h-9 w-20 shrink-0 tabular-nums"
          >
            <SelectValue>{(value: string) => `${value} cr`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {creditOptions.map((credits) => (
              <SelectItem key={credits} value={String(credits)}>
                {credits} {credits === 1 ? "credit" : "credits"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {selectedCredits}cr
        </span>
      )}
      <button
        type="button"
        aria-label={`Remove ${course.id}`}
        className="pointer-events-none flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive focus:pointer-events-auto focus:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          removeCourse(courseId);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
