"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, AlertTriangle, X } from "lucide-react";
import { ReportIssueDialog } from "@/components/corrections/ReportIssueDialog";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCourseData } from "@/hooks/useCourseData";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import { PROGRAMS_BY_ID, isActivelyCrossListed } from "@/lib/clientReferenceData";
import { placementCredits } from "@/lib/credits";
import { warningReportContext } from "@/lib/corrections/warningContext";
import { activeProgramIds } from "@/lib/programProfile";
import type { PlanPlacementV2, PlanWarning } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePlannerStore } from "@/store/plannerStore";

export function CourseChip({
  placement,
  onSelect,
}: {
  placement: PlanPlacementV2;
  onSelect: () => void;
}) {
  const { t } = useLocale();
  const { warningsByCourse, effectiveMajors, coursesById } = usePlanDerived();
  const { snapshot } = useCourseData();
  const [reporting, setReporting] = useState<PlanWarning | null>(null);
  const removeCourse = usePlannerStore((state) => state.removeCourse);
  const setSelectedCredits = usePlannerStore((state) => state.setSelectedCredits);
  const completedSemesters = usePlannerStore((state) => state.completedSemesters);
  const startYear = usePlannerStore((state) => state.startYear);
  const programProfile = usePlannerStore((state) => state.programProfile);
  const activePrograms = activeProgramIds(programProfile);
  const courseId = placement.courseId;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `chip:${placement.placementId}`,
    data: { placementId: placement.placementId, courseId },
  });
  const course = coursesById.get(courseId);

  if (!course) {
    return (
      <div ref={setNodeRef} data-testid={`chip-${placement.placementId}`} className="flex items-center gap-3 rounded-xl border border-dashed bg-background p-3 text-left">
        <button type="button" {...listeners} {...attributes} className="min-w-0 flex-1 cursor-grab text-left" onClick={onSelect}>
          <span className="block font-mono text-xs text-muted-foreground">{courseId}</span>
          <span className="block truncate text-sm font-medium">{placement.titleSnapshot ?? "Course details loading…"}</span>
        </button>
        <button type="button" aria-label={`Remove ${courseId}`} className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive" onClick={() => removeCourse(placement.placementId)}>
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  const warnings = warningsByCourse.get(courseId) ?? [];
  const hasError = warnings.some((warning) => warning.severity === "error");
  const minimumCredits = course.minCredits ?? course.credits;
  const maximumCredits = course.maxCredits ?? course.credits;
  const selectedCredits = placementCredits(placement, course);
  const creditOptions = Array.from(
    { length: Math.floor(maximumCredits - minimumCredits) + 1 },
    (_, index) => minimumCredits + index,
  );
  if (creditOptions.at(-1) !== maximumCredits) creditOptions.push(maximumCredits);
  const isDone = completedSemesters.includes(placement.semesterId);
  const cross = isActivelyCrossListed(course, activePrograms);
  const allocationLabel = cross
    ? effectiveMajors(courseId).map((id) => PROGRAMS_BY_ID.get(id)?.shortName ?? id).join("+") || "—"
    : null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      data-testid={`chip-${placement.placementId}`}
      className={cn(
        "group flex min-h-16 items-center gap-3 rounded-xl border bg-background p-3.5 text-left transition-[border-color,background-color,opacity] duration-[var(--motion-fast)] hover:border-primary/35 hover:bg-muted/45",
        warnings.length > 0 && (hasError ? "border-destructive" : "border-amber-500"),
        isDone && "opacity-70",
        isDragging && "z-10 opacity-50",
      )}
    >
      <div {...listeners} {...attributes} className="flex min-w-0 flex-1 cursor-grab items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onSelect}>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-mono text-xs font-semibold text-primary">{course.id}</span>
          <span className="truncate text-sm leading-tight font-medium">{course.title}</span>
        </div>
        {allocationLabel && <Badge variant="outline" className="shrink-0 px-1 text-[10px]">{allocationLabel}</Badge>}
        {placement.expectedGrade && <Badge variant="secondary" className="shrink-0 px-1 text-[10px] font-semibold" title={`Expected grade: ${placement.expectedGrade}`}>{placement.expectedGrade}</Badge>}
      </div>
      {warnings.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("plan.warningsFor", { subject: course.id })} className="size-9 shrink-0" />}
          >
            {hasError ? <AlertCircle className="text-destructive" /> : <AlertTriangle className="text-amber-500" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-w-80">
            {warnings.map((warning) => (
              <DropdownMenuItem key={warning.id} onClick={() => setReporting(warning)}>
                <span className="line-clamp-2">{t("plan.reportWarning", { message: warning.message })}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {maximumCredits > minimumCredits ? (
        <Select value={String(selectedCredits)} onValueChange={(value) => setSelectedCredits(placement.placementId, Number(value))}>
          <SelectTrigger size="sm" aria-label={`Credits for ${course.id}`} className="h-9 w-20 shrink-0 tabular-nums"><SelectValue>{(value: string) => `${value} cr`}</SelectValue></SelectTrigger>
          <SelectContent>{creditOptions.map((credits) => <SelectItem key={credits} value={String(credits)}>{credits} {credits === 1 ? "credit" : "credits"}</SelectItem>)}</SelectContent>
        </Select>
      ) : <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{selectedCredits}cr</span>}
      <button
        type="button"
        aria-label={`Remove ${course.id}`}
        className="pointer-events-none flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity duration-[var(--motion-fast)] hover:bg-muted hover:text-destructive focus:pointer-events-auto focus:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
        onClick={(event) => { event.stopPropagation(); removeCourse(placement.placementId); }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      {reporting && (
        <ReportIssueDialog
          open
          onOpenChange={(open) => { if (!open) setReporting(null); }}
          context={warningReportContext(reporting, snapshot.id === "offline-bootstrap" ? null : snapshot.id, startYear)}
        />
      )}
    </div>
  );
}
