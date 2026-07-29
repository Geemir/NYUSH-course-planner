"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CorrectionTarget, CreateCorrectionRequest } from "@/lib/corrections/types";

export interface ReportIssueContext {
  target: CorrectionTarget;
  catalogReleaseId: string | null;
  sourceId?: string;
  sourceSnapshotId?: string;
  schoolName?: string;
  sourceUrl?: string;
  displayedValue?: string;
  tableId?: string;
  sourceIndex?: number;
  label: string;
}

export function ReportIssueDialog({ open, onOpenChange, context, onSubmitted }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  context: ReportIssueContext;
  onSubmitted?(id: string): void;
}) {
  const { t } = useLocale();
  const [issueType, setIssueType] = useState<CreateCorrectionRequest["issueType"]>("incorrect_course_information");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error" | "rate-limited">("idle");
  const [error, setError] = useState("");

  const changeOpen = (next: boolean) => {
    if (!next) { setState("idle"); setError(""); }
    onOpenChange(next);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 5 || description.trim().length < 20) {
      setError("Add a short title and at least 20 characters describing the issue.");
      return;
    }
    if (evidenceUrl && !evidenceUrl.startsWith("https://")) {
      setError("Evidence links must use HTTPS.");
      return;
    }
    setState("submitting"); setError("");
    const body: CreateCorrectionRequest = {
      target: context.target,
      issueType,
      catalogReleaseId: context.catalogReleaseId,
      context: {
        sourceId: context.sourceId,
        sourceSnapshotId: context.sourceSnapshotId,
        schoolName: context.schoolName,
        sourceUrl: context.sourceUrl,
        displayedValue: context.displayedValue,
        tableId: context.tableId,
        sourceIndex: context.sourceIndex,
      },
      title: title.trim(), description: description.trim(),
      suggestedCorrection: suggestion.trim() || undefined,
      evidenceUrl: evidenceUrl.trim() || undefined,
    };
    try {
      const response = await fetch("/api/corrections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (response.status === 429) { setState("rate-limited"); return; }
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in to submit a report." : "The report could not be submitted.");
      const result = await response.json() as { id: string };
      setState("success"); onSubmitted?.(result.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The report could not be submitted.");
      setState("error");
    }
  };

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      {state === "success" ? <div className="space-y-4 py-4 text-center">
        <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
        <DialogHeader><DialogTitle>{t("report.submitted")}</DialogTitle><DialogDescription>{t("report.submittedDescription")}</DialogDescription></DialogHeader>
        <Button onClick={() => changeOpen(false)}>{t("report.done")}</Button>
      </div> : <form onSubmit={submit} noValidate className="space-y-5 rounded-xl bg-card p-1">
        <DialogHeader><DialogTitle>{t("report.title")}</DialogTitle><DialogDescription>{t("report.formDescription")}</DialogDescription></DialogHeader>
        <div className="rounded-xl border bg-muted/35 p-3 text-sm">
          <p className="font-medium">{context.label}</p>
          {context.displayedValue && <p className="mt-1 line-clamp-3 text-muted-foreground">{context.displayedValue}</p>}
          {context.sourceUrl && <a href={context.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary">{t("report.source")} <ExternalLink className="size-3" /></a>}
        </div>
        <label className="grid gap-1.5 text-sm font-medium">{t("report.issueType")}
          <select className="h-11 rounded-lg border bg-background px-3 font-normal" value={issueType} onChange={(event) => setIssueType(event.target.value as CreateCorrectionRequest["issueType"])}>
            <option value="incorrect_course_information">{t("report.incorrectCourse")}</option>
            <option value="missing_course">{t("report.missingCourse")}</option>
            <option value="incorrect_nyush_requirement">{t("report.incorrectRequirement")}</option>
            <option value="nyush_fulfillment_review">{t("report.fulfillmentReview")}</option>
            <option value="duplicate_crosslist_equivalency">{t("report.duplicate")}</option>
            <option value="other_catalog_problem">{t("report.other")}</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">{t("report.titleLabel")}<Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></label>
        <label className="grid gap-1.5 text-sm font-medium">{t("report.wrong")}<Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} rows={5} required /></label>
        <label className="grid gap-1.5 text-sm font-medium">{t("report.suggestion")} <span className="font-normal text-muted-foreground">{t("report.optional")}</span><Textarea value={suggestion} onChange={(event) => setSuggestion(event.target.value)} maxLength={4000} rows={3} /></label>
        <label className="grid gap-1.5 text-sm font-medium">{t("report.evidence")} <span className="font-normal text-muted-foreground">{t("report.httpsOptional")}</span><Input type="url" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://…" /></label>
        {(error || state === "rate-limited") && <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="size-4 shrink-0" />{state === "rate-limited" ? t("report.rateLimited") : error}</p>}
        <p className="text-xs leading-5 text-muted-foreground">{t("report.disclaimer")}</p>
        <DialogFooter><Button type="button" variant="outline" onClick={() => changeOpen(false)}>{t("common.cancel")}</Button><Button type="submit" disabled={state === "submitting"}>{state === "submitting" ? t("report.submitting") : t("report.submit")}</Button></DialogFooter>
      </form>}
    </DialogContent>
  </Dialog>;
}
