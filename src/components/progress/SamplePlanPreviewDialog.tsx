"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BulletinSamplePlan } from "@/lib/bulletin/displayTypes";
import { createCatalogClient, type CatalogClient } from "@/lib/catalogClient";
import {
  buildSamplePlanPreview,
  defaultSamplePlanSelections,
  selectedSamplePlanChanges,
  type SamplePlanPreview,
  type SamplePlanSelectionAction,
} from "@/lib/samplePlan";
import type { PlanPlacementV2, PlanningSlot } from "@/lib/types";
import type { SamplePlanChangeSet } from "@/store/plannerStore";

interface SamplePlanPreviewDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  programId: string;
  catalogReleaseId: string;
  samplePlan: BulletinSamplePlan;
  placements: readonly PlanPlacementV2[];
  planningSlots: readonly PlanningSlot[];
  client?: CatalogClient;
  onApply(changes: SamplePlanChangeSet): void;
}

const STATUS_LABELS = {
  add: "Ready to add",
  keep: "Already in this term",
  conflict: "Different term in your plan",
  placeholder: "Planning placeholder",
  unavailable: "Unavailable for automatic import",
} as const;

function exactCodes(samplePlan: BulletinSamplePlan): string[] {
  return [...new Set(samplePlan.terms.flatMap((term) => term.rows.flatMap((row) => row.kind === "course" && row.linkedCourseCodes.length === 1 ? row.linkedCourseCodes : [])))];
}

export function SamplePlanPreviewDialog({
  open,
  onOpenChange,
  programId,
  catalogReleaseId,
  samplePlan,
  placements,
  planningSlots,
  client: injectedClient,
  onApply,
}: SamplePlanPreviewDialogProps) {
  const clientRef = useRef<CatalogClient>(injectedClient ?? createCatalogClient());
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [preview, setPreview] = useState<SamplePlanPreview | null>(null);
  const [selections, setSelections] = useState<Record<string, SamplePlanSelectionAction>>({});
  const requestedKey = useRef<string | null>(null);
  const codes = useMemo(() => exactCodes(samplePlan), [samplePlan]);
  const requestKey = `${catalogReleaseId}:${codes.join("|")}`;

  useEffect(() => {
    if (!open) {
      requestedKey.current = null;
      return;
    }
    if (requestedKey.current === requestKey) return;
    requestedKey.current = requestKey;
    const controller = new AbortController();
    setState("loading");
    const resolutionRequest = codes.length > 0
      ? clientRef.current.resolveCourseCodes(codes, controller.signal)
      : Promise.resolve({ releaseId: catalogReleaseId, matches: [] });
    resolutionRequest.then((resolution) => {
      const next = buildSamplePlanPreview({ programId, catalogReleaseId, samplePlan, resolution, placements, planningSlots });
      setPreview(next);
      setSelections(defaultSamplePlanSelections(next));
      setState("ready");
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState("error");
      requestedKey.current = null;
    });
    return () => {
      controller.abort();
      if (requestedKey.current === requestKey) requestedKey.current = null;
    };
  }, [catalogReleaseId, codes, open, placements, planningSlots, programId, requestKey, samplePlan]);

  const rows = preview?.terms.flatMap((term) => term.rows) ?? [];
  const warnings = rows.filter((row) => row.status === "conflict" || row.status === "unavailable").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview sample plan</DialogTitle>
          <DialogDescription>
            Exact courses can be added automatically. Choices remain editable placeholders,
            and courses already in another term stay where they are unless you move them.
          </DialogDescription>
        </DialogHeader>

        {state === "loading" && (
          <div role="status" className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
            Matching exact Bulletin course codes…
          </div>
        )}
        {state === "error" && (
          <div role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
            The current catalog release could not resolve this sample plan. Nothing has been changed.
          </div>
        )}
        {state === "ready" && preview && (
          <div className="space-y-4">
            {warnings > 0 && (
              <p role="note" className="flex gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-foreground">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
                {warnings} row{warnings === 1 ? " needs" : "s need"} attention. Safe defaults keep current terms and skip unresolved courses.
              </p>
            )}
            {preview.terms.map((term) => (
              <section key={term.sourceIndex} className="space-y-2">
                <h3 className="text-sm font-semibold">{term.heading}</h3>
                <ul className="divide-y rounded-xl bg-card px-3 ring-1 ring-border">
                  {term.rows.map((row) => (
                    <li key={row.sourceKey} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{row.courseCode ? `${row.courseCode} · ${row.label}` : row.label}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {row.status === "add" || row.status === "keep" ? <CheckCircle2 aria-hidden="true" className="size-3.5 text-emerald-600" /> : null}
                          {STATUS_LABELS[row.status]}
                        </p>
                      </div>
                      {(row.status === "add" || row.status === "placeholder") && (
                        <label className="flex min-h-11 items-center gap-2 text-sm">
                          <input type="checkbox" checked={(selections[row.sourceKey] ?? row.defaultAction) !== "skip"} onChange={(event) => setSelections((current) => ({ ...current, [row.sourceKey]: event.target.checked ? row.defaultAction : "skip" }))} />
                          Include
                        </label>
                      )}
                      {row.status === "conflict" && (
                        <fieldset className="flex flex-col gap-1 text-sm">
                          <legend className="sr-only">Placement for {row.courseCode}</legend>
                          <label className="flex items-center gap-2"><input type="radio" name={row.sourceKey} checked={(selections[row.sourceKey] ?? "skip") === "skip"} onChange={() => setSelections((current) => ({ ...current, [row.sourceKey]: "skip" }))} />Keep current term</label>
                          <label className="flex items-center gap-2"><input type="radio" name={row.sourceKey} checked={selections[row.sourceKey] === "move"} onChange={() => setSelections((current) => ({ ...current, [row.sourceKey]: "move" }))} />Move to recommended term</label>
                        </fieldset>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={state !== "ready" || !preview} onClick={() => preview && onApply(selectedSamplePlanChanges(preview, selections))}>Apply selected</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
