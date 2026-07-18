"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
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
  label: string;
}

export function ReportIssueDialog({ open, onOpenChange, context, onSubmitted }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  context: ReportIssueContext;
  onSubmitted?(id: string): void;
}) {
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
        <DialogHeader><DialogTitle>Report submitted</DialogTitle><DialogDescription>Maintainers can now review the evidence. You can follow updates in My reports.</DialogDescription></DialogHeader>
        <Button onClick={() => changeOpen(false)}>Done</Button>
      </div> : <form onSubmit={submit} noValidate className="space-y-5 rounded-xl bg-card p-1">
        <DialogHeader><DialogTitle>Report an issue</DialogTitle><DialogDescription>Flag catalog or NYUSH degree-planning information for maintainer review.</DialogDescription></DialogHeader>
        <div className="rounded-xl border bg-muted/35 p-3 text-sm">
          <p className="font-medium">{context.label}</p>
          {context.displayedValue && <p className="mt-1 line-clamp-3 text-muted-foreground">{context.displayedValue}</p>}
          {context.sourceUrl && <a href={context.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary">View immutable source reference <ExternalLink className="size-3" /></a>}
        </div>
        <label className="grid gap-1.5 text-sm font-medium">Issue type
          <select className="h-11 rounded-lg border bg-background px-3 font-normal" value={issueType} onChange={(event) => setIssueType(event.target.value as CreateCorrectionRequest["issueType"])}>
            <option value="incorrect_course_information">Incorrect course information</option>
            <option value="missing_course">Missing course</option>
            <option value="incorrect_nyush_requirement">Incorrect NYUSH requirement</option>
            <option value="nyush_fulfillment_review">NYUSH fulfillment review</option>
            <option value="duplicate_crosslist_equivalency">Duplicate or cross-list equivalency</option>
            <option value="other_catalog_problem">Other catalog problem</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">Title<Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></label>
        <label className="grid gap-1.5 text-sm font-medium">What appears to be wrong?<Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} rows={5} required /></label>
        <label className="grid gap-1.5 text-sm font-medium">Suggested correction <span className="font-normal text-muted-foreground">(optional)</span><Textarea value={suggestion} onChange={(event) => setSuggestion(event.target.value)} maxLength={4000} rows={3} /></label>
        <label className="grid gap-1.5 text-sm font-medium">Evidence link <span className="font-normal text-muted-foreground">(optional, HTTPS)</span><Input type="url" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://…" /></label>
        {(error || state === "rate-limited") && <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="size-4 shrink-0" />{state === "rate-limited" ? "Too many recent reports. Please wait before trying again." : error}</p>}
        <p className="text-xs leading-5 text-muted-foreground">Reviewed by the NYUSH Degree Planner maintainers; this is not an official NYU decision. No file attachments are collected.</p>
        <DialogFooter><Button type="button" variant="outline" onClick={() => changeOpen(false)}>Cancel</Button><Button type="submit" disabled={state === "submitting"}>{state === "submitting" ? "Submitting…" : "Submit report"}</Button></DialogFooter>
      </form>}
    </DialogContent>
  </Dialog>;
}
