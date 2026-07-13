"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import { FeasibilityStatus } from "@/lib/feasibility";
import { SemesterId, semesterTermName } from "@/lib/types";
import { usePlannerStore } from "@/store/plannerStore";

const STATUS: Record<
  FeasibilityStatus,
  { label: string; tone: string; icon: typeof CheckCircle2; blurb: string }
> = {
  complete: {
    label: "All requirements met",
    tone: "text-emerald-600 dark:text-emerald-400",
    icon: CheckCircle2,
    blurb: "Every active program requirement is already covered by your plan.",
  },
  feasible: {
    label: "Finishable on time",
    tone: "text-emerald-600 dark:text-emerald-400",
    icon: CheckCircle2,
    blurb: "Your remaining requirements fit by senior spring within a normal course load.",
  },
  "feasible-with-overload": {
    label: "Finishable, but tight",
    tone: "text-amber-600 dark:text-amber-400",
    icon: TriangleAlert,
    blurb: "You can finish on time, but at least one semester would exceed 18 credits (advisor approval needed).",
  },
  infeasible: {
    label: "Not finishable as planned",
    tone: "text-destructive",
    icon: AlertCircle,
    blurb: "Some requirements can't be scheduled before graduation — see below.",
  },
};

export function FeasibilityDialog() {
  const { feasibility, coursesById } = usePlanDerived();
  const placeCourse = usePlannerStore((s) => s.placeCourse);
  const startYear = usePlannerStore((s) => s.startYear);
  const [open, setOpen] = useState(false);

  const meta = STATUS[feasibility.status];
  const Icon = meta.icon;

  // Group suggested additions by term for display.
  const byTerm = new Map<SemesterId, string[]>();
  for (const s of feasibility.suggestion) {
    byTerm.set(s.semesterId, [...(byTerm.get(s.semesterId) ?? []), s.courseId]);
  }
  const terms = [...byTerm.keys()].sort();

  const autoFill = () => {
    for (const s of feasibility.suggestion) placeCourse(s.courseId, s.semesterId);
    toast.success(`Added ${feasibility.suggestion.length} suggested course(s)`);
    setOpen(false);
  };

  const title = (id: string) => coursesById.get(id)?.title ?? id;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="w-full" />}
      >
        <ClipboardCheck />
        Check feasibility
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${meta.tone}`}>
            <Icon className="size-5" />
            {meta.label}
          </DialogTitle>
          <DialogDescription>{meta.blurb}</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto">
          {feasibility.unplaceable.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h3 className="text-sm font-semibold text-destructive">
                Can&apos;t be scheduled
              </h3>
              {feasibility.unplaceable.map((u) => (
                <div key={u.courseId} className="text-sm">
                  <span className="font-mono text-xs">{u.courseId}</span>{" "}
                  {title(u.courseId)} —{" "}
                  <span className="text-muted-foreground">{u.reason}</span>
                </div>
              ))}
            </section>
          )}

          {feasibility.overloadedTerms.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                Over the 18-credit cap
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {feasibility.overloadedTerms.map((t) => (
                  <Badge key={t.semesterId} variant="secondary">
                    {semesterTermName(t.semesterId, startYear)} · {t.credits} cr
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {feasibility.suggestion.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">
                Suggested schedule to finish ({feasibility.suggestion.length}{" "}
                course{feasibility.suggestion.length === 1 ? "" : "s"})
              </h3>
              {terms.map((t) => (
                <div key={t} className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {semesterTermName(t, startYear)}
                  </span>
                  {byTerm.get(t)!.map((id) => (
                    <div key={id} className="flex items-center gap-1.5 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">
                        {id}
                      </span>
                      <span className="truncate">{title(id)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          )}

          {feasibility.status === "complete" && (
            <p className="py-2 text-sm text-muted-foreground">
              Nothing left to schedule. 🎓
            </p>
          )}
        </div>

        {feasibility.suggestion.length > 0 && (
          <DialogFooter>
            <Button onClick={autoFill} data-testid="feasibility-autofill">
              Auto-fill these {feasibility.suggestion.length} course
              {feasibility.suggestion.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
