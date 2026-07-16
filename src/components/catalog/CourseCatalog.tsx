"use client";

import { useMemo, useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
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

const QUICK_FILTERS = [
  { id: "all", label: "All courses" },
  { id: "cross", label: "Cross-listed" },
  { id: "custom", label: "My added courses" },
  { id: "unplanned", label: "Not planned yet" },
];

type FilterGroup = {
  label: string;
  options: { id: string; label: string }[];
};

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
        "group flex cursor-grab items-center gap-3 rounded-xl border bg-background p-3 outline-none transition-colors duration-[var(--motion-fast)] hover:border-primary/40 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring",
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
          <span className="text-[11px] font-medium text-muted-foreground/80">
            {course.offeringKnown === false
              ? "Schedule varies"
              : course.offered.map((t) => t.slice(0, 2)).join(" · ")}
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
              size="icon"
              className="size-11"
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
  const { courses, customIds, programs } = useCourseData();
  const { placementByCourse } = usePlanDerived();
  const activePrograms = usePlannerStore((s) => s.activePrograms);
  const scrollParentRef = useRef<HTMLDivElement>(null);

  const filterGroups = useMemo<FilterGroup[]>(() => {
    const activeProgramSet = new Set(activePrograms);
    const programOptions = programs
      .filter((program) => activeProgramSet.has(program.id))
      .map((program) => ({
        id: `program:${program.id}`,
        label: `${program.name} program`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const subjectOptions = [...new Set(courses.map((course) => course.department))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map((subject) => ({
        id: `subject:${subject}`,
        label: `${subject} subject`,
      }));
    const attributeOptions = [
      ...new Set(courses.flatMap((course) => course.attributes ?? [])),
    ]
      .sort((a, b) => a.localeCompare(b))
      .map((attribute) => ({
        id: `attribute:${attribute}`,
        label: attribute,
      }));
    const termOptions = [
      courses.some(
        (course) => course.offeringKnown !== false && course.offered.includes("fall"),
      ) && { id: "term:fall", label: "Fall" },
      courses.some(
        (course) => course.offeringKnown !== false && course.offered.includes("spring"),
      ) && { id: "term:spring", label: "Spring" },
      courses.some((course) => course.offeringKnown === false) && {
        id: "term:unknown",
        label: "Schedule varies",
      },
    ].filter((option): option is { id: string; label: string } => Boolean(option));

    return [
      { label: "Catalog", options: QUICK_FILTERS },
      { label: "Active programs", options: programOptions },
      { label: "Subjects", options: subjectOptions },
      { label: "Attributes", options: attributeOptions },
      { label: "Typical term", options: termOptions },
    ].filter((group) => group.options.length > 0);
  }, [activePrograms, courses, programs]);

  const filterLabel = useMemo(
    () =>
      filterGroups
        .flatMap((group) => group.options)
        .find((option) => option.id === filter)?.label ?? "All courses",
    [filter, filterGroups],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return courses
      .filter((course) => {
        if (
          q &&
          !course.id.toLowerCase().includes(q) &&
          !course.title.toLowerCase().includes(q) &&
          !course.department.toLowerCase().includes(q) &&
          !course.description?.toLowerCase().includes(q)
        ) {
          return false;
        }
        if (filter.startsWith("program:")) {
          const programId = filter.slice("program:".length);
          return course.fulfills.some(
            (fulfillment) => fulfillment.programId === programId,
          );
        }
        if (filter.startsWith("subject:")) {
          return course.department === filter.slice("subject:".length);
        }
        if (filter.startsWith("attribute:")) {
          return (
            course.attributes?.includes(filter.slice("attribute:".length)) ?? false
          );
        }
        if (filter === "term:unknown") return course.offeringKnown === false;
        if (filter.startsWith("term:")) {
          const term = filter.slice("term:".length) as "fall" | "spring";
          return course.offeringKnown !== false && course.offered.includes(term);
        }
        if (filter === "cross") {
          return isActivelyCrossListed(course, activePrograms);
        }
        if (filter === "custom") return customIds.has(course.id);
        if (filter === "unplanned") return !placementByCourse.has(course.id);
        return true;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [courses, customIds, query, filter, placementByCourse, activePrograms]);

  // TanStack Virtual intentionally exposes imperative measurement callbacks.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 96,
    overscan: 6,
    getItemKey: (index) => filtered[index]?.id ?? index,
  });

  return (
    <div className="flex flex-col gap-2.5">
      <AddCourseDialog />
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search courses…"
          aria-label="Search courses"
          className="h-11 pl-9 text-base"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Select value={filter} onValueChange={(v) => setFilter(v as string)}>
          <SelectTrigger
            size="sm"
            className="h-11 flex-1 text-sm"
            aria-label="Filter courses"
          >
            <SelectValue>{filterLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {filterGroups.map((group, groupIndex) => (
              <div key={group.label}>
                {groupIndex > 0 && <SelectSeparator />}
                <SelectGroup>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.options.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </div>
            ))}
          </SelectContent>
        </Select>
        <output
          aria-live="polite"
          aria-label="Course results"
          className="shrink-0 text-xs tabular-nums text-muted-foreground"
        >
          {filtered.length} of {courses.length} courses
        </output>
      </div>
      <div
        ref={scrollParentRef}
        role="list"
        aria-label="Course catalog"
        className="max-h-[calc(100vh-280px)] overflow-y-auto pr-1"
      >
        {filtered.length > 0 && (
          <div
            className="relative w-full"
            style={{ height: rowVirtualizer.getTotalSize() }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const course = filtered[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  role="listitem"
                  className="absolute top-0 left-0 w-full pb-2"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <CatalogCard
                    course={course}
                    isCustom={customIds.has(course.id)}
                    onSelect={onSelectCourse}
                    onMenuClosed={onMenuClosed}
                  />
                </div>
              );
            })}
          </div>
        )}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No courses match your search.
          </p>
        )}
      </div>
    </div>
  );
}
