"use client";

import { CheckCircle2, Circle, GraduationCap } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import { CategoryProgress, semesterTermName } from "@/lib/types";
import { usePlannerStore } from "@/store/plannerStore";

function unitsLabel(c: CategoryProgress): string {
  const suffix = c.unitKind === "credits" ? " cr" : "";
  return `${c.plannedUnits}/${c.requiredUnits}${suffix}`;
}

function CategoryRow({ category }: { category: CategoryProgress }) {
  const { placementByCourse, coursesById } = usePlanDerived();
  const completedSemesters = usePlannerStore((s) => s.completedSemesters);
  const startYear = usePlannerStore((s) => s.startYear);
  const done = category.plannedUnits >= category.requiredUnits;

  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {category.isCapstone && <GraduationCap className="size-4" />}
          {category.name}
        </span>
        <Badge variant={done ? "default" : "secondary"} className="text-xs">
          {unitsLabel(category)}
        </Badge>
      </div>
      <ul className="flex flex-col gap-1">
        {category.matchedCourseIds.map((courseId) => {
          const placement = placementByCourse.get(courseId);
          const isDone =
            placement !== undefined &&
            completedSemesters.includes(placement.semesterId);
          return (
            <li
              key={courseId}
              className="flex items-center gap-1.5 text-sm text-muted-foreground"
            >
              {isDone ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
              ) : (
                <Circle className="size-3.5 shrink-0" />
              )}
              <span className="font-mono text-xs">{courseId}</span>
              <span className="truncate text-xs">
                {coursesById.get(courseId)?.title}
              </span>
              {placement && (
                <span className="ml-auto shrink-0 text-[11px]">
                  {semesterTermName(placement.semesterId, startYear)}
                </span>
              )}
            </li>
          );
        })}
        {category.missingCourseIds.map((courseId) => (
          <li
            key={courseId}
            className="flex items-center gap-1.5 text-sm text-destructive/80"
          >
            <Circle className="size-3.5 shrink-0" />
            <span className="font-mono text-xs">{courseId}</span>
            <span className="truncate text-xs">
              {coursesById.get(courseId)?.title}
            </span>
            <span className="ml-auto shrink-0 text-[11px]">not planned</span>
          </li>
        ))}
        {!done && category.missingCourseIds.length === 0 && (
          <li className="text-xs text-muted-foreground italic">
            {category.requiredUnits - category.plannedUnits}
            {category.unitKind === "credits" ? " more credits" : " more"} needed
          </li>
        )}
      </ul>
    </div>
  );
}

export function RequirementChecklist() {
  const { activeProgramObjs, progressByProgram } = usePlanDerived();

  return (
    <Accordion>
      {activeProgramObjs.map((program) => {
        const p = progressByProgram.get(program.id);
        if (!p) return null;
        return (
          <AccordionItem key={program.id} value={program.id}>
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: program.color }}
                />
                {program.name}
                <span className="text-xs font-normal tabular-nums text-muted-foreground">
                  {Math.round(p.plannedFraction * 100)}%
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col divide-y">
                {p.categories.map((category) => (
                  <CategoryRow key={category.categoryId} category={category} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
