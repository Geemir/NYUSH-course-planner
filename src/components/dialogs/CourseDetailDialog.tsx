"use client";

import { useState } from "react";
import { AlertCircle, AlertTriangle, PenLine } from "lucide-react";
import { EditCourseForm } from "@/components/dialogs/EditCourseForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import {
  PROGRAMS_BY_ID,
  SITES_BY_ID,
  activeCrossListedMajors,
  isActivelyCrossListed,
} from "@/lib/data";
import {
  GRADES,
  Grade,
  SEMESTER_IDS,
  SemesterId,
  semesterFullLabel,
} from "@/lib/types";
import { usePlannerStore } from "@/store/plannerStore";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function CourseDetailDialog({
  courseId,
  onClose,
}: {
  courseId: string | null;
  onClose: () => void;
}) {
  const {
    placementByCourse,
    warningsByCourse,
    effectiveMajors,
    allocation,
    coursesById,
    customIds,
  } = usePlanDerived();
  const placeCourse = usePlannerStore((s) => s.placeCourse);
  const removeCourse = usePlannerStore((s) => s.removeCourse);
  const removeCustomCourse = usePlannerStore((s) => s.removeCustomCourse);
  const setAllocation = usePlannerStore((s) => s.setAllocation);
  const setExpectedGrade = usePlannerStore((s) => s.setExpectedGrade);
  const startYear = usePlannerStore((s) => s.startYear);
  const activePrograms = usePlannerStore((s) => s.activePrograms);
  const [editing, setEditing] = useState(false);

  const course = courseId ? coursesById.get(courseId) : undefined;
  if (!course) return null;
  const isCustom = customIds.has(course.id);

  const placement = placementByCourse.get(course.id);
  const warnings = warningsByCourse.get(course.id) ?? [];
  const cross = isActivelyCrossListed(course, activePrograms);
  const majors = activeCrossListedMajors(course, activePrograms);
  const currentMajors = effectiveMajors(course.id)
    .map((id) => PROGRAMS_BY_ID.get(id)?.shortName ?? id)
    .join(" + ");

  const close = () => {
    setEditing(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className={editing ? "sm:max-w-lg" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {course.title}
            {isCustom && (
              <Badge
                variant="outline"
                className="border-primary/50 text-primary"
              >
                Custom
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {course.id} · {course.department} · {course.credits} credits
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <EditCourseForm
            key={course.id}
            course={course}
            onDone={() => setEditing(false)}
          />
        ) : (
          <>
        <div className="flex flex-col gap-3.5">
          {course.description && (
            <p className="text-sm text-muted-foreground">{course.description}</p>
          )}
          <div className="flex gap-6">
            <Row label="Offered">
              <span className="capitalize">{course.offered.join(", ")}</span>
            </Row>
            <Row label="Available at">
              <span>
                {course.sites
                  .map((s) => SITES_BY_ID.get(s)?.label ?? s)
                  .join(", ")}
              </span>
            </Row>
          </div>

          <Row label="Prerequisites">
            {course.prereqs.length === 0 ? (
              <span className="text-muted-foreground">None</span>
            ) : (
              <ul className="list-inside list-disc">
                {course.prereqs.map((group, i) => (
                  <li key={i} className="font-mono text-xs">
                    {group.join(" or ")}
                  </li>
                ))}
              </ul>
            )}
          </Row>

          <Row label="Counts toward">
            <div className="flex flex-wrap gap-1">
              {course.fulfills.length === 0 && (
                <span className="text-muted-foreground">
                  Free elective (graduation credits only)
                </span>
              )}
              {course.fulfills.map((f) => {
                const program = PROGRAMS_BY_ID.get(f.programId);
                const category = program?.categories.find(
                  (c) => c.id === f.categoryId,
                );
                return (
                  <Badge
                    key={`${f.programId}/${f.categoryId}`}
                    variant="secondary"
                    className="text-[10px]"
                    style={{ borderColor: program?.color }}
                  >
                    {program?.shortName}: {category?.name}
                  </Badge>
                );
              })}
            </div>
          </Row>

          <Row label={placement ? "Semester" : "Add to semester"}>
            <Select
              value={placement?.semesterId ?? null}
              onValueChange={(value) =>
                placeCourse(course.id, value as SemesterId)
              }
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="Choose a semester…">
                  {(value: SemesterId | null) =>
                    value ? semesterFullLabel(value, startYear) : "Choose a semester…"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SEMESTER_IDS.map((semesterId) => (
                  <SelectItem key={semesterId} value={semesterId}>
                    {semesterFullLabel(semesterId, startYear)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          {placement && (
            <Row label="Expected grade (optional)">
              <Select
                value={placement.expectedGrade ?? "none"}
                onValueChange={(value) =>
                  setExpectedGrade(
                    course.id,
                    value === "none" ? null : (value as Grade),
                  )
                }
              >
                <SelectTrigger
                  size="sm"
                  className="w-full"
                  data-testid="grade-select"
                >
                  <SelectValue>
                    {(value: string) =>
                      value === "none" ? "Not set" : value
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {GRADES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Some special rules unlock concurrent prerequisites based on your
                grade (e.g. an A in ICP).
              </p>
            </Row>
          )}

          {placement && cross && (
            <Row label="Count toward which major?">
              <div className="flex flex-col gap-1.5">
                <Select
                  value={placement.allocation}
                  onValueChange={(value) =>
                    setAllocation(course.id, value as string)
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="w-full"
                    data-testid="allocation-select"
                  >
                    <SelectValue>
                      {(value: string) =>
                        value === "auto"
                          ? `Auto (currently ${currentMajors || "unused"})`
                          : value === "split"
                            ? "Both majors (double-count)"
                            : `${PROGRAMS_BY_ID.get(value)?.shortName ?? value} only`
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      Auto — let the planner decide
                    </SelectItem>
                    {majors.map((id) => (
                      <SelectItem key={id} value={id}>
                        {PROGRAMS_BY_ID.get(id)?.shortName ?? id} only
                      </SelectItem>
                    ))}
                    <SelectItem value="split">
                      Both majors (double-count)
                    </SelectItem>
                  </SelectContent>
                </Select>
                {allocation.budget && (
                  <span className="text-xs text-muted-foreground">
                    Double-count budget: {allocation.budget.used}/
                    {allocation.budget.limit} used
                  </span>
                )}
              </div>
            </Row>
          )}

          {warnings.length > 0 && (
            <Row label="Warnings">
              <ul className="flex flex-col gap-1">
                {warnings.map((w) => (
                  <li key={w.id} className="flex items-start gap-1.5 text-xs">
                    {w.severity === "error" ? (
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                    ) : (
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                    )}
                    <span className="text-muted-foreground">{w.message}</span>
                  </li>
                ))}
              </ul>
            </Row>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            data-testid="edit-course"
          >
            <PenLine />
            Edit course
          </Button>
          {isCustom && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                removeCustomCourse(course.id);
                close();
              }}
            >
              Delete custom course
            </Button>
          )}
          {placement && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                removeCourse(course.id);
                close();
              }}
            >
              Remove from plan
            </Button>
          )}
        </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
