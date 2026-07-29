"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { AlertCircle, AlertTriangle, GraduationCap, Leaf, Sprout } from "lucide-react";
import { ReportIssueDialog } from "@/components/corrections/ReportIssueDialog";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { CourseChip } from "@/components/planner/CourseChip";
import { PlanningSlotCard, type PlanningSlotSelection } from "@/components/planner/PlanningSlotCard";
import { StudyAwaySelect } from "@/components/planner/StudyAwaySelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCourseData } from "@/hooks/useCourseData";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import { warningReportContext } from "@/lib/corrections/warningContext";
import { cn } from "@/lib/utils";
import { type PlanPlacementV2, type PlanWarning, SemesterId, semesterTerm, semesterTermName } from "@/lib/types";
import {
  MAX_SEMESTER_CREDITS,
  MIN_SEMESTER_CREDITS,
} from "@/lib/validation";
import { usePlannerStore } from "@/store/plannerStore";

export function SemesterColumn({
  semesterId,
  onSelectCourse,
  onChooseSlot,
}: {
  semesterId: SemesterId;
  onSelectCourse: (placement: PlanPlacementV2) => void;
  onChooseSlot?: (selection: PlanningSlotSelection) => void;
}) {
  const { t } = useLocale();
  const { isOver, setNodeRef } = useDroppable({ id: semesterId });
  const { placementsBySemester, creditsBySemester, coursesById, warningsBySemester } =
    usePlanDerived();
  const { snapshot } = useCourseData();
  const [reporting, setReporting] = useState<PlanWarning | null>(null);
  const completed = usePlannerStore((s) =>
    s.completedSemesters.includes(semesterId),
  );
  const toggleCompleted = usePlannerStore((s) => s.toggleCompletedSemester);
  const startYear = usePlannerStore((s) => s.startYear);
  const planningSlots = usePlannerStore((s) => s.planningSlots);
  const slots = planningSlots.filter((slot) => slot.semesterId === semesterId);
  const isFall = semesterTerm(semesterId) === "fall";

  const placements = placementsBySemester.get(semesterId) ?? [];
  const warnings = warningsBySemester.get(semesterId) ?? [];
  const credits = creditsBySemester.get(semesterId) ?? 0;
  const tentativeCredits = slots.reduce((sum, slot) => sum + (slot.credits ?? 0), 0);
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
        "flex min-h-56 flex-col gap-5 rounded-2xl border bg-card p-5 shadow-[0_4px_18px_rgb(31_24_36/5%)] transition-[border-color,box-shadow] duration-[var(--motion-fast)] sm:p-6",
        isOver && "ring-2 ring-primary/60",
        completed && "bg-muted/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">
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
        <div className="flex items-center gap-1">
          {warnings.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("plan.warningsFor", { subject: semesterTermName(semesterId, startYear) })} className="size-9" />}
              >
                {warnings.some((warning) => warning.severity === "error")
                  ? <AlertCircle className="text-destructive" />
                  : <AlertTriangle className="text-amber-500" />}
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
          {tentativeCredits > 0 && (
            <Badge variant="outline" className="px-1.5 text-xs tabular-nums" title="Tentative sample-plan workload">
              +{tentativeCredits} tentative
            </Badge>
          )}
        </div>
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
          {t("plan.done")}
        </label>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {placements.map((p) => (
          <CourseChip
            key={"placementId" in p ? String(p.placementId) : p.courseId}
            placement={p as PlanPlacementV2}
            onSelect={() => onSelectCourse(p as PlanPlacementV2)}
          />
        ))}
        {slots.map((slot) => <PlanningSlotCard key={slot.id} slot={slot} onChoose={onChooseSlot ?? (() => undefined)} />)}
        {placements.length === 0 && slots.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed px-5 py-7 text-center text-sm leading-relaxed text-muted-foreground">
            {t("plan.emptySemester")}
          </div>
        )}
      </div>
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
