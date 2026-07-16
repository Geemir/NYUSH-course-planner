"use client";

import { AlertCircle, AlertTriangle, EyeOff, Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePlanDerived } from "@/hooks/usePlanDerived";
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
  const { warnings, dismissedWarnings } = usePlanDerived();
  const dismissWarning = usePlannerStore((s) => s.dismissWarning);
  const restoreWarning = usePlannerStore((s) => s.restoreWarning);
  const sorted = [...warnings].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1,
  );

  return (
    <div className="flex flex-col gap-1">
      {sorted.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Sparkles className="size-4 text-emerald-500" />
          {dismissedWarnings.length > 0
            ? "No open conflicts."
            : "No conflicts — your plan looks good."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 py-1" data-testid="warning-center">
          {sorted.map((warning) => (
            <li key={warning.id} className="group flex items-start gap-2 text-sm">
              {severityIcon(warning)}
              <span className="flex-1 leading-snug text-muted-foreground">
                {warning.message}
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Dismiss warning"
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
            Dismissed ({dismissedWarnings.length})
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
                  aria-label="Restore warning"
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
    </div>
  );
}
