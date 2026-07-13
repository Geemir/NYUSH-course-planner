"use client";

import { useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Check, Plus, Search } from "lucide-react";
import { AddCourseDialog } from "@/components/dialogs/AddCourseDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCourseData } from "@/hooks/useCourseData";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import {
  PROGRAMS_BY_ID,
  activeCrossListedMajors,
  isActivelyCrossListed,
} from "@/lib/data";
import { cn } from "@/lib/utils";
import { Course, SEMESTER_IDS, semesterFullLabel } from "@/lib/types";
import { usePlannerStore } from "@/store/plannerStore";

const FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All courses" },
  { id: "cs", label: "CS major" },
  { id: "ima", label: "IMA major" },
  { id: "core", label: "NYUSH Core" },
  { id: "cross", label: "Cross-listed" },
  { id: "custom", label: "My added courses" },
  { id: "unplanned", label: "Not planned yet" },
];

function CatalogCard({
  course,
  isCustom,
  onSelect,
  onMenuClosed,
}: {
  course: Course;
  isCustom: boolean;
  onSelect: (courseId: string) => void;
  onMenuClosed: () => void;
}) {
  const { placementByCourse } = usePlanDerived();
  const placeCourse = usePlannerStore((s) => s.placeCourse);
  const removeCourse = usePlannerStore((s) => s.removeCourse);
  const startYear = usePlannerStore((s) => s.startYear);
  const activePrograms = usePlannerStore((s) => s.activePrograms);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: `catalog:${course.id}` });

  const placement = placementByCourse.get(course.id);
  const crossLabel = isActivelyCrossListed(course, activePrograms)
    ? activeCrossListedMajors(course, activePrograms)
        .map((id) => PROGRAMS_BY_ID.get(id)?.shortName ?? id)
        .join("/")
    : null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Translate.toString(transform) }}
      onClick={() => onSelect(course.id)}
      data-testid={`catalog-${course.id}`}
      className={cn(
        "group flex cursor-grab items-center gap-2 rounded-lg border bg-background p-2.5 transition-colors duration-150 hover:border-primary/40 hover:bg-muted/50",
        placement && "opacity-60",
        isDragging && "z-10 opacity-50",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="font-mono text-xs font-medium text-muted-foreground">
            {course.id}
          </span>
          <span className="text-xs text-muted-foreground">
            {course.credits}cr
          </span>
          {crossLabel && (
            <Badge variant="outline" className="px-1 text-[10px]">
              {crossLabel}
            </Badge>
          )}
          {isCustom && (
            <Badge
              variant="outline"
              className="border-primary/50 px-1 text-[10px] text-primary"
            >
              Custom
            </Badge>
          )}
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            {course.offered.map((t) => t.slice(0, 2)).join("·")}
          </span>
        </div>
        <span className="truncate text-sm font-medium">{course.title}</span>
        {placement && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" />
            {semesterFullLabel(placement.semesterId, startYear)}
          </span>
        )}
      </div>
      <DropdownMenu onOpenChange={(open) => !open && onMenuClosed()}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Assign ${course.id} to a semester`}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
            />
          }
        >
          <Plus />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {placement ? "Move to" : "Add to semester"}
            </DropdownMenuLabel>
            {SEMESTER_IDS.map((semesterId) => (
              <DropdownMenuItem
                key={semesterId}
                onClick={() => placeCourse(course.id, semesterId)}
              >
                {semesterFullLabel(semesterId, startYear)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {placement && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => removeCourse(course.id)}
              >
                Remove from plan
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function CourseCatalog({
  onSelectCourse,
  onMenuClosed,
}: {
  onSelectCourse: (courseId: string) => void;
  onMenuClosed: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const { courses, customIds } = useCourseData();
  const { placementByCourse } = usePlanDerived();
  const activePrograms = usePlannerStore((s) => s.activePrograms);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return courses
      .filter((course) => {
        if (
          q &&
          !course.id.toLowerCase().includes(q) &&
          !course.title.toLowerCase().includes(q)
        ) {
          return false;
        }
        switch (filter) {
          case "cs":
          case "ima":
          case "core":
            return course.fulfills.some((f) => f.programId === filter);
          case "cross":
            return isActivelyCrossListed(course, activePrograms);
          case "custom":
            return customIds.has(course.id);
          case "unplanned":
            return !placementByCourse.has(course.id);
          default:
            return true;
        }
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [courses, customIds, query, filter, placementByCourse, activePrograms]);

  return (
    <div className="flex flex-col gap-2.5">
      <AddCourseDialog />
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search courses…"
          className="h-9 pl-8 text-sm"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Select value={filter} onValueChange={(v) => setFilter(v as string)}>
          <SelectTrigger size="sm" className="flex-1 text-sm">
            <SelectValue>
              {(value: string) =>
                FILTERS.find((f) => f.id === value)?.label ?? value
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {filtered.length}/{courses.length}
        </span>
      </div>
      <div className="flex max-h-[calc(100vh-280px)] flex-col gap-2 overflow-y-auto pr-1">
        {filtered.map((course) => (
          <CatalogCard
            key={course.id}
            course={course}
            isCustom={customIds.has(course.id)}
            onSelect={onSelectCourse}
            onMenuClosed={onMenuClosed}
          />
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No courses match your search.
          </p>
        )}
      </div>
    </div>
  );
}
