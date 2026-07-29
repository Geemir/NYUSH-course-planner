"use client";

import { useState } from "react";
import { AlertCircle, AlertTriangle, EyeOff, Flag, Sparkles, Undo2 } from "lucide-react";
import { ReportIssueDialog } from "@/components/corrections/ReportIssueDialog";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import { useCourseData } from "@/hooks/useCourseData";
import { warningReportContext } from "@/lib/corrections/warningContext";
import { PlanWarning } from "@/lib/types";
import { usePlannerStore } from "@/store/plannerStore";

function severityIcon(warning: PlanWarning) {
  return warning.severity === "error" ? (
    <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
  ) : (
    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
  );
}

export function WarningCenter() {
  const { t } = useLocale();
  const { warnings, dismissedWarnings } = usePlanDerived();
  const { snapshot } = useCourseData();
  const [reporting, setReporting] = useState<PlanWarning | null>(null);
  const dismissWarning = usePlannerStore((s) => s.dismissWarning);
  const restoreWarning = usePlannerStore((s) => s.restoreWarning);
  const startYear = usePlannerStore((s) => s.startYear);
  const sorted = [...warnings].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1,
  );

  return (
    <div className="flex flex-col gap-1">
      {sorted.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Sparkles className="size-4 text-emerald-500" />
          {dismissedWarnings.length > 0
            ? t("progress.noOpenConflicts")
            : t("progress.noConflicts")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 py-1" data-testid="warning-center">
          {sorted.map((warning) => (
            <li key={warning.id} className="group flex items-start gap-2 text-sm">
              {severityIcon(warning)}
              <span className="flex-1 leading-snug text-muted-foreground">
                {warning.message}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("progress.report")}
                className="size-9 shrink-0 opacity-60 transition-opacity duration-[var(--motion-fast)] group-hover:opacity-100"
                onClick={() => setReporting(warning)}
              >
                <Flag />
              </Button>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("progress.dismiss")}
                      className="size-9 shrink-0 opacity-60 transition-opacity duration-[var(--motion-fast)] group-hover:opacity-100"
                      onClick={() => dismissWarning(warning.id)}
                    />
                  }
                >
                  <EyeOff />
                </TooltipTrigger>
                <TooltipContent>I know — hide this warning</TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}

      {dismissedWarnings.length > 0 && (
        <details className="text-sm" data-testid="dismissed-warnings">
          <summary className="cursor-pointer py-1 text-xs font-medium text-muted-foreground select-none">
            {t("progress.dismissed", { count: dismissedWarnings.length })}
          </summary>
          <ul className="flex flex-col gap-1.5 py-1">
            {dismissedWarnings.map((warning) => (
              <li
                key={warning.id}
                className="flex items-start gap-2 text-sm opacity-60"
              >
                {severityIcon(warning)}
                <span className="flex-1 leading-snug text-muted-foreground line-through decoration-muted-foreground/40">
                  {warning.message}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("progress.restore")}
                  className="size-9 shrink-0"
                  onClick={() => restoreWarning(warning.id)}
                >
                  <Undo2 />
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
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
