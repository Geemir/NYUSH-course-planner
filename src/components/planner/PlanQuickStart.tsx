"use client";

import { useState } from "react";
import { CalendarRange, Sparkles, X } from "lucide-react";
import { useCatalog } from "@/components/CatalogProvider";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { SamplePlanPreviewDialog } from "@/components/progress/SamplePlanPreviewDialog";
import { Button } from "@/components/ui/button";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import { usePlannerStore } from "@/store/plannerStore";

/**
 * First-run shortcut shown above an empty timeline. The Bulletin's suggested
 * four-year plan already exists in the catalog but was only reachable deep in
 * the Progress panel, so a new student faced eight blank semesters. This turns
 * that into a one-click editable draft.
 */
export function PlanQuickStart() {
  const { t } = useLocale();
  const { bootstrap } = useCatalog();
  const { activeProgramObjs } = usePlanDerived();
  const placements = usePlannerStore((state) => state.placements);
  const planningSlots = usePlannerStore((state) => state.planningSlots);
  const primaryMajorId = usePlannerStore((state) => state.programProfile.primaryMajorId);
  const applySamplePlan = usePlannerStore((state) => state.applySamplePlan);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Only for a genuinely untouched plan.
  const planIsEmpty = placements.length === 0 && planningSlots.length === 0;
  const program = activeProgramObjs.find((item) => item.id === primaryMajorId);
  const samplePlan =
    program && "samplePlan" in program ? program.samplePlan : undefined;

  if (dismissed || !planIsEmpty || !samplePlan || samplePlan.importStatus !== "eligible") {
    return null;
  }

  return (
    <section
      aria-labelledby="plan-quick-start-heading"
      className="mb-6 rounded-2xl border border-primary/25 bg-primary/5 p-4"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 id="plan-quick-start-heading" className="text-sm font-semibold">
            {t("quickStart.title")}
          </h3>
          <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            {t("quickStart.body", { program: program?.name ?? "" })}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => setPreviewOpen(true)}>
              <CalendarRange aria-hidden="true" />
              {t("quickStart.action")}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t("quickStart.hint")}
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          aria-label={t("quickStart.dismiss")}
          onClick={() => setDismissed(true)}
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      <SamplePlanPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        programId={primaryMajorId}
        catalogReleaseId={bootstrap.release.id}
        samplePlan={samplePlan}
        placements={placements}
        planningSlots={planningSlots}
        onApply={(changes) => {
          applySamplePlan(changes);
          setPreviewOpen(false);
        }}
      />
    </section>
  );
}
