"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, Check, Plus, RotateCcw, Search } from "lucide-react";
import { useCatalog } from "@/components/CatalogProvider";
import { useLocale } from "@/components/i18n/LocaleProvider";
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
import { useCatalogSearch } from "@/hooks/useCatalogSearch";
import { useCourseData } from "@/hooks/useCourseData";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import type { PlanningSlotSelection } from "@/components/planner/PlanningSlotCard";
import { cn } from "@/lib/utils";
import { type Course, SEMESTER_IDS, semesterFullLabel } from "@/lib/types";
import { usePlannerStore, type CoursePlacementInput } from "@/store/plannerStore";

export type CatalogCourseSelection =
  | { kind: "bulletin"; stableId: string }
  | { kind: "custom"; courseId: string };

type DisplayItem = {
  key: string;
  course: Course;
  record?: CatalogCourseRecord;
  isCustom: boolean;
};

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange(value: string): void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as string)}>
      <SelectTrigger size="sm" aria-label={label} className="h-10 min-w-32 flex-1">
        {/* Base UI's Select.Value renders the raw value ("all") unless given a
            function to map it — show the option's descriptive label instead. */}
        <SelectValue>
          {(current: string) =>
            options.find((option) => option.value === current)?.label ?? current
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CatalogCard({
  item,
  sourceName,
  onSelect,
  onMenuClosed,
  onChooseForSlot,
}: {
  item: DisplayItem;
  sourceName: string;
  onSelect(selection: CatalogCourseSelection): void;
  onMenuClosed(): void;
  onChooseForSlot?: (course: CoursePlacementInput) => void;
}) {
  const { t } = useLocale();
  const { course, record, isCustom } = item;
  const { placementByCustomCourse, placementByCatalogId } = usePlanDerived();
  const placeCourse = usePlannerStore((state) => state.placeCourse);
  const removeCourse = usePlannerStore((state) => state.removeCourse);
  const startYear = usePlannerStore((state) => state.startYear);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `catalog:${item.key}`,
    data: {
      course: record
        ? { courseId: record.code, catalogCourseId: record.stableId, titleSnapshot: record.course.title.slice(0, 200) }
        : { courseId: course.id, titleSnapshot: course.title.slice(0, 200) },
    },
  });
  const placement = record
    ? placementByCatalogId.get(record.stableId)
    : placementByCustomCourse.get(course.id);
  const isNewYork = record && record.sourceId !== "nyu-shanghai";
  const select = () => {
    if (onChooseForSlot) {
      onChooseForSlot(record
        ? { courseId: record.code, catalogCourseId: record.stableId, titleSnapshot: record.course.title.slice(0, 200) }
        : { courseId: course.id, titleSnapshot: course.title.slice(0, 200) });
      return;
    }
    onSelect(record
      ? { kind: "bulletin", stableId: record.stableId }
      : { kind: "custom", courseId: course.id });
  };

  return (
    <div className="relative">
      <article
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Translate.toString(transform) }}
      onClick={select}
      data-testid={`catalog-${item.key}`}
      className={cn(
        "group flex min-h-28 cursor-grab items-start gap-3 rounded-2xl border bg-card p-4 pr-16 outline-none transition-[border-color,background-color,box-shadow] duration-[var(--motion-fast)] hover:border-primary/35 hover:bg-muted/35 focus-visible:ring-3 focus-visible:ring-ring/35",
        placement && "opacity-70",
        isDragging && "z-10 opacity-50",
      )}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs font-semibold text-primary">{course.id}</span>
          <span className="text-xs text-muted-foreground">{course.credits} cr</span>
          {isCustom && <Badge variant="outline">Custom</Badge>}
          {isNewYork && <Badge variant="secondary">New York study-away catalog</Badge>}
        </div>
        <h3 className="truncate text-[15px] font-semibold leading-5">{course.title}</h3>
        {record && (
          <p className="text-xs text-muted-foreground">{sourceName}</p>
        )}
        {isNewYork && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Availability and registration eligibility not confirmed
          </p>
        )}
        {record && record.catalogOfferingTerms.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Bulletin catalog pattern: {record.catalogOfferingTerms.join(", ")} — not a current schedule
          </p>
        )}
        {placement && (
          <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" aria-hidden="true" />
            {semesterFullLabel(placement.semesterId, startYear)}
          </p>
        )}
      </div>
      </article>
      <div className="absolute top-2 right-2">
        <DropdownMenu onOpenChange={(open) => !open && onMenuClosed()}>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" className="size-11" aria-label={`Assign ${course.id} to a semester`} />}
          >
            <Plus />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{placement ? t("catalog.move") : t("catalog.add")}</DropdownMenuLabel>
              {SEMESTER_IDS.map((semesterId) => (
                <DropdownMenuItem key={semesterId} onClick={() => placeCourse(record ? { courseId: record.code, catalogCourseId: record.stableId, titleSnapshot: record.course.title.slice(0, 200) } : { courseId: course.id, titleSnapshot: course.title.slice(0, 200) }, semesterId)}>
                  {semesterFullLabel(semesterId, startYear)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            {placement && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => removeCourse("placementId" in placement ? String(placement.placementId) : course.id)}>{t("catalog.remove")}</DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function CourseCatalog({
  onSelectCourse,
  onMenuClosed,
  slotSelection,
  onChooseForSlot,
}: {
  onSelectCourse(selection: CatalogCourseSelection): void;
  onMenuClosed(): void;
  slotSelection?: PlanningSlotSelection | null;
  onChooseForSlot?: (course: CoursePlacementInput) => void;
}) {
  const { t } = useLocale();
  const search = useCatalogSearch();
  const catalog = useCatalog();
  const { courses, customIds, programs } = useCourseData();
  const { placementByCustomCourse, placementByCatalogId } = usePlanDerived();
  const scrollParentRef = useRef<HTMLDivElement>(null);
  const [localFilter, setLocalFilter] = useState("all");
  const customCourses = courses.filter((course) => customIds.has(course.id));
  const setSearchQuery = search.setQuery;

  useEffect(() => {
    if (slotSelection) setSearchQuery({ q: slotSelection.query });
  }, [setSearchQuery, slotSelection]);

  const displayItems = useMemo<DisplayItem[]>(() => {
    if (localFilter === "custom") {
      return customCourses.map((course) => ({
        key: `custom:${course.id}`,
        course,
        isCustom: true,
      }));
    }
    const bulletin = search.items
      .filter((record) => localFilter !== "unplanned" || !placementByCatalogId.has(record.stableId))
      .map((record) => ({ key: record.stableId, course: record.course, record, isCustom: false }));
    if (localFilter === "cross" || search.query.sourceIds.length || search.query.campuses.length) return bulletin;
    return [
      ...bulletin,
      ...customCourses
        .filter((course) => localFilter !== "unplanned" || !placementByCustomCourse.has(course.id))
        .map((course) => ({ key: `custom:${course.id}`, course, isCustom: true })),
    ];
  }, [customCourses, localFilter, placementByCatalogId, placementByCustomCourse, search.items, search.query.campuses.length, search.query.sourceIds.length]);

  const sourceNames = useMemo(
    () => new Map(catalog.bootstrap.sources.map((source) => [source.id, source.schoolName])),
    [catalog.bootstrap.sources],
  );
  const sourceHealthIssue = catalog.bootstrap.sources.some((source) => source.status !== "healthy");
  const clearFilters = () => search.setQuery({
    q: "", campuses: [], sourceIds: [], subjects: [], catalogTerms: [],
    levels: ["undergraduate"], minCredits: undefined, maxCredits: undefined,
    fulfillsProgramId: undefined, crossListed: undefined,
  });
  const clearAllFilters = () => {
    setLocalFilter("all");
    clearFilters();
  };

  // TanStack Virtual intentionally exposes imperative measurement callbacks.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: displayItems.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 142,
    overscan: 5,
    getItemKey: (index) => displayItems[index]?.key ?? index,
  });

  return (
    <section className="flex flex-col gap-3" aria-label={t("workspace.courseCatalog")}>
      {slotSelection && (
        <p role="status" className="rounded-xl bg-primary/7 p-3 text-sm ring-1 ring-primary/20">
          Choosing a course for <span className="font-medium">{slotSelection.query}</span>. The selected course will replace the placeholder in the same semester.
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <AddCourseDialog />
      </div>
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={search.query.q} onChange={(event) => search.setQuery({ q: event.target.value })} placeholder={t("catalog.searchPlaceholder")} aria-label={t("catalog.search")} className="h-13 rounded-xl bg-card pl-10 text-[15px] shadow-xs" aria-describedby="catalog-search-hint" />
      </div>
      {/* Shown only before the first query: it teaches the three ways to search
          without nagging someone who already knows. */}
      {search.query.q.trim() === "" && (
        <p id="catalog-search-hint" className="-mt-1 px-1 text-xs leading-relaxed text-muted-foreground">
          {t("catalog.searchHint")}
        </p>
      )}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={clearAllFilters}><RotateCcw />{t("catalog.clearFilters")}</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FilterSelect label={t("catalog.campus")} value={search.query.campuses[0] ?? "all"} onChange={(value) => search.setQuery({ campuses: value === "all" ? [] : [value as "shanghai" | "new-york"] })} options={[{ value: "all", label: t("catalog.allCampuses") }, { value: "shanghai", label: "Shanghai" }, { value: "new-york", label: "New York" }]} />
        <FilterSelect label={t("catalog.school")} value={search.query.sourceIds[0] ?? "all"} onChange={(value) => search.setQuery({ sourceIds: value === "all" ? [] : [value] })} options={[{ value: "all", label: t("catalog.allSchools") }, ...catalog.bootstrap.sources.map((source) => ({ value: source.id, label: source.schoolName }))]} />
        <FilterSelect label={t("catalog.subject")} value={search.query.subjects[0] ?? "all"} onChange={(value) => search.setQuery({ subjects: value === "all" ? [] : [value] })} options={[{ value: "all", label: t("catalog.allSubjects") }, ...catalog.bootstrap.filters.subjects.map((subject) => ({ value: subject.subject, label: subject.subject }))]} />
        <FilterSelect label={t("catalog.term")} value={search.query.catalogTerms[0] ?? "all"} onChange={(value) => search.setQuery({ catalogTerms: value === "all" ? [] : [value] })} options={[{ value: "all", label: t("catalog.anyPattern") }, ...catalog.bootstrap.filters.catalogTerms.map((term) => ({ value: term, label: term }))]} />
        <FilterSelect label={t("catalog.credits")} value={search.query.minCredits === search.query.maxCredits && search.query.minCredits !== undefined ? String(search.query.minCredits) : "all"} onChange={(value) => search.setQuery(value === "all" ? { minCredits: undefined, maxCredits: undefined } : { minCredits: Number(value), maxCredits: Number(value) })} options={[{ value: "all", label: t("catalog.anyCredits") }, { value: "2", label: "2 credits" }, { value: "4", label: "4 credits" }]} />
        <FilterSelect label={t("catalog.fulfillment")} value={search.query.fulfillsProgramId ?? "all"} onChange={(value) => search.setQuery({ fulfillsProgramId: value === "all" ? undefined : value })} options={[{ value: "all", label: t("catalog.anyMapping") }, ...programs.map((program) => ({ value: program.id, label: program.name }))]} />
        <FilterSelect label={t("catalog.localFilter")} value={localFilter} onChange={(value) => { setLocalFilter(value); search.setQuery({ crossListed: value === "cross" ? true : undefined }); }} options={[{ value: "all", label: t("catalog.allResults") }, { value: "custom", label: t("catalog.customCourses") }, { value: "cross", label: t("catalog.crossListed") }, { value: "unplanned", label: t("catalog.notPlanned") }]} />
      </div>

      {(search.isStale || catalog.status === "stale") && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">{t("catalog.offline")}</p>}
      {sourceHealthIssue && <p role="status" className="rounded-lg border p-2 text-xs text-muted-foreground"><AlertTriangle className="mr-1 inline size-3.5" />Some Bulletin sources are stale or temporarily unavailable.</p>}
      {search.status === "loading" && <div role="status" aria-live="polite" aria-label={t("catalog.loading")} className="space-y-2">{[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div>}
      {search.status === "error" && <div role="alert" className="rounded-xl border p-4 text-sm">{t("catalog.searchError")} <Button size="sm" variant="outline" onClick={() => void search.retry()}>{t("catalog.retry")}</Button></div>}

      {search.status !== "loading" && (
        <div ref={scrollParentRef} role="list" aria-label={t("workspace.courseCatalog")} className="max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
          {displayItems.length > 0 && <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = displayItems[virtualRow.index];
              return <div key={virtualRow.key} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} role="listitem" className="absolute top-0 left-0 w-full pb-2" style={{ transform: `translateY(${virtualRow.start}px)` }}><CatalogCard item={item} sourceName={item.record ? sourceNames.get(item.record.sourceId) ?? item.record.sourceId : "Custom course"} onSelect={onSelectCourse} onMenuClosed={onMenuClosed} onChooseForSlot={slotSelection ? onChooseForSlot : undefined} /></div>;
            })}
          </div>}
          {(search.status === "empty" || (search.status === "ready" && displayItems.length === 0)) && <p className="py-10 text-center text-sm text-muted-foreground">{t("catalog.noResults")}</p>}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <output aria-live="polite" aria-label={t("catalog.results")} className="text-xs tabular-nums text-muted-foreground">{t("catalog.count", { count: displayItems.length })}</output>
        {search.nextCursor && <Button variant="outline" disabled={search.status === "loading-more"} onClick={() => void search.loadMore()}>{search.status === "loading-more" ? t("common.loading") : t("catalog.loadMore")}</Button>}
      </div>
    </section>
  );
}
