"use client";

import { useState } from "react";
import { CalendarRange, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BulletinSamplePlan } from "@/lib/bulletin/displayTypes";
import { SamplePlanPreviewDialog } from "@/components/progress/SamplePlanPreviewDialog";
import { usePlannerStore } from "@/store/plannerStore";

interface SampleStudyPlanProps {
  programId: string;
  catalogReleaseId: string;
  samplePlan: BulletinSamplePlan;
}

export function SampleStudyPlan({ programId, catalogReleaseId, samplePlan }: SampleStudyPlanProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const placements = usePlannerStore((state) => state.placements);
  const planningSlots = usePlannerStore((state) => state.planningSlots);
  const applySamplePlan = usePlannerStore((state) => state.applySamplePlan);
  const eligible = samplePlan.importStatus === "eligible";

  return (
    <section className="mt-8 space-y-4" aria-labelledby={`${programId}-sample-plan-heading`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id={`${programId}-sample-plan-heading`} className="flex items-center gap-2 text-base font-semibold">
            <CalendarRange aria-hidden="true" className="size-5 text-primary" />
            {samplePlan.heading}
          </h3>
          <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
            This plan is illustrative, not a promise that every course will be offered
            in the shown term. Review prerequisites and current scheduling before enrolling.
          </p>
        </div>
        {eligible && (
          <Button type="button" onClick={() => setPreviewOpen(true)}>
            Use this sample plan
          </Button>
        )}
      </div>

      {!eligible && (
        <p role="note" className="flex max-w-[70ch] gap-2 rounded-xl bg-muted/55 p-3 text-sm text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          This Bulletin plan can be viewed, but its term structure is not safe for automatic import.
        </p>
      )}

      <div className="space-y-3">
        {samplePlan.terms.map((term) => (
          <section key={term.sourceIndex} className="rounded-xl bg-card p-4 ring-1 ring-border">
            <div className="flex items-baseline justify-between gap-3 border-b pb-2">
              <h4 className="text-sm font-semibold">{term.heading}</h4>
              {term.creditsText && <span className="text-xs tabular-nums text-muted-foreground">{term.creditsText} credits</span>}
            </div>
            {term.rows.length ? (
              <ul className="mt-2 divide-y">
                {term.rows.map((row) => (
                  <li key={row.sourceIndex} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <span>{row.kind === "course" ? [...row.linkedCourseCodes, row.text].join(" · ") : row.label}</span>
                    {row.creditsText && <span className="shrink-0 tabular-nums text-muted-foreground">{row.creditsText}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pt-3 text-sm text-muted-foreground">No rows were listed for this term.</p>
            )}
          </section>
        ))}
      </div>
      {samplePlan.totalCreditsText && <p className="text-right text-sm font-semibold">Total credits · {samplePlan.totalCreditsText}</p>}

      {eligible && (
        <SamplePlanPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          programId={programId}
          catalogReleaseId={catalogReleaseId}
          samplePlan={samplePlan}
          placements={placements}
          planningSlots={planningSlots}
          onApply={(changes) => {
            applySamplePlan(changes);
            setPreviewOpen(false);
          }}
        />
      )}
    </section>
  );
}
