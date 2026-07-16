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
import { useFeasibility, usePlanDerived } from "@/hooks/usePlanDerived";
import type { FeasibilityStatus } from "@/lib/feasibility";
import { type SemesterId, semesterTermName } from "@/lib/types";
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
    label: "A schedule was found",
    tone: "text-emerald-600 dark:text-emerald-400",
    icon: CheckCircle2,
    blurb: "The remaining requirements fit by senior spring within a normal course load.",
  },
  "feasible-with-overload": {
    label: "A tight schedule was found",
    tone: "text-amber-600 dark:text-amber-400",
    icon: TriangleAlert,
    blurb: "The suggested path requires at least one semester above 18 credits and advisor approval.",
  },
  infeasible: {
    label: "No schedule found",
    tone: "text-destructive",
    icon: AlertCircle,
    blurb: "This search could not place every remaining requirement. Review the constraints below with an advisor.",
  },
};

function FeasibilityResults({ onClose }: { onClose: () => void }) {
  const feasibility = useFeasibility();
  const { coursesById } = usePlanDerived();
  const placeCourse = usePlannerStore((state) => state.placeCourse);
  const startYear = usePlannerStore((state) => state.startYear);
  const meta = STATUS[feasibility.status];
  const Icon = meta.icon;

  const byTerm = new Map<SemesterId, string[]>();
  for (const suggestion of feasibility.suggestion) {
    byTerm.set(suggestion.semesterId, [
      ...(byTerm.get(suggestion.semesterId) ?? []),
      suggestion.courseId,
    ]);
  }
  const terms = [...byTerm.keys()].sort();
  const title = (id: string) => coursesById.get(id)?.title ?? id;
  const autoFill = () => {
    for (const suggestion of feasibility.suggestion) {
      placeCourse(suggestion.courseId, suggestion.semesterId);
    }
    toast.success(`Added ${feasibility.suggestion.length} suggested course(s)`);
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Heuristic planning guidance</DialogTitle>
        <DialogDescription>
          This is a greedy planning check, not proof that no valid schedule exists.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-start gap-2.5">
        <Icon className={`mt-0.5 size-5 shrink-0 ${meta.tone}`} />
        <div>
          <h3 className={`text-sm font-semibold ${meta.tone}`}>{meta.label}</h3>
          <p className="text-sm text-muted-foreground">{meta.blurb}</p>
        </div>
      </div>

      <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto">
        {feasibility.requirementGaps.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              Advisor or policy follow-up
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              These requirements cannot be represented as scheduled courses.
              Record the supporting evidence in degree progress after confirming
              it with your advisor.
            </p>
            <ul className="flex flex-col gap-2">
              {feasibility.requirementGaps.map((gap, index) => (
                <li
                  key={`${gap.kind}:${gap.label}:${index}`}
                  className="rounded-lg bg-muted/45 p-3 text-sm"
                >
                  <p className="font-medium">{gap.label}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {gap.kind === "manual"
                      ? gap.sourceText
                      : gap.kind === "waiver"
                        ? "A documented waiver or placement decision is required."
                        : "Choose an eligible course with an advisor."}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {feasibility.unplaceable.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-destructive">
              Could not be scheduled
            </h3>
            {feasibility.unplaceable.map((item) => (
              <div key={item.courseId} className="text-sm">
                <span className="font-mono text-xs">{item.courseId}</span>{" "}
                {title(item.courseId)}: {" "}
                <span className="text-muted-foreground">{item.reason}</span>
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
              {feasibility.overloadedTerms.map((term) => (
                <Badge key={term.semesterId} variant="secondary">
                  {semesterTermName(term.semesterId, startYear)}: {term.credits} cr
                </Badge>
              ))}
            </div>
          </section>
        )}

        {feasibility.suggestion.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              Suggested schedule ({feasibility.suggestion.length} course
              {feasibility.suggestion.length === 1 ? "" : "s"})
            </h3>
            {terms.map((term) => (
              <div key={term} className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {semesterTermName(term, startYear)}
                </span>
                {byTerm.get(term)!.map((id) => (
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
            Nothing remains to schedule.
          </p>
        )}
      </div>

      {feasibility.suggestion.length > 0 && (
        <DialogFooter>
          <Button onClick={autoFill} data-testid="feasibility-autofill">
            Add {feasibility.suggestion.length} suggested course
            {feasibility.suggestion.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      )}
    </DialogContent>
  );
}

export function FeasibilityDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" className="h-11 w-full" />}
      >
        <ClipboardCheck />
        Check feasibility
      </DialogTrigger>
      {open && <FeasibilityResults onClose={() => setOpen(false)} />}
    </Dialog>
  );
}
