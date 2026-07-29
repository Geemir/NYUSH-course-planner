"use client";

import { useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import type { DirectCatalogOverlayInput } from "@/lib/catalogMaintenance/types";

export function CourseMaintenanceEditor({ record, releaseId = null, onPublish }: {
  record: CatalogCourseRecord;
  releaseId?: string | null;
  onPublish: (input: DirectCatalogOverlayInput) => Promise<void>;
}) {
  const [title, setTitle] = useState(record.course.title);
  const [description, setDescription] = useState(record.course.description ?? "");
  const [prerequisites, setPrerequisites] = useState(record.course.prerequisiteText ?? "");
  const [minCredits, setMinCredits] = useState(String(record.course.minCredits ?? record.course.credits));
  const [maxCredits, setMaxCredits] = useState(String(record.course.maxCredits ?? record.course.credits));
  const [fall, setFall] = useState(record.course.offered.includes("fall"));
  const [spring, setSpring] = useState(record.course.offered.includes("spring"));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const publish = async (deleteCourse = false) => {
    setBusy(true);
    try {
      await onPublish({
        patch: deleteCourse ? { kind: "course-delete", stableId: record.stableId } : {
          kind: "course", stableId: record.stableId, changes: {
            title: title.trim(), description: description.trim(), prerequisiteText: prerequisites.trim(),
            minCredits: Number(minCredits), maxCredits: Number(maxCredits),
            offered: [fall ? "fall" as const : null, spring ? "spring" as const : null].filter((term): term is "fall" | "spring" => term !== null),
            offeringKnown: fall || spring,
            catalogOfferingTerms: [fall ? "Fall" : null, spring ? "Spring" : null].filter((term): term is string => term !== null),
            catalogOfferingText: [fall ? "Fall" : null, spring ? "Spring" : null].filter(Boolean).join(" and ") || null,
          },
        },
        reason: reason.trim(), sourceReleaseId: releaseId,
      });
      setReason("");
    } finally { setBusy(false); }
  };

  return <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5">
    <div><p className="font-mono text-xs text-muted-foreground">{record.stableId}</p><h3 className="font-semibold">{record.code}</h3></div>
    <label className="grid gap-1 text-sm">Title<Input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label className="grid gap-1 text-sm">Description<Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    <label className="grid gap-1 text-sm">Prerequisites<Textarea aria-label="Prerequisites" value={prerequisites} onChange={(event) => setPrerequisites(event.target.value)} /></label>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Minimum credits<Input aria-label="Minimum credits" type="number" min="0" step="0.5" value={minCredits} onChange={(event) => setMinCredits(event.target.value)} /></label>
      <label className="grid gap-1 text-sm">Maximum credits<Input aria-label="Maximum credits" type="number" min="0" step="0.5" value={maxCredits} onChange={(event) => setMaxCredits(event.target.value)} /></label>
    </div>
    <fieldset className="flex gap-4 text-sm"><legend className="mb-1 font-medium">Usually offered</legend>
      <label className="flex items-center gap-2"><input type="checkbox" checked={fall} onChange={(event) => setFall(event.target.checked)} /> Fall</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={spring} onChange={(event) => setSpring(event.target.checked)} /> Spring</label>
    </fieldset>
    <label className="grid gap-1 text-sm font-medium">Reason for change<Textarea aria-label="Reason for change" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required audit note" /></label>
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button disabled={busy || reason.trim().length < 3} onClick={() => void publish(false)}>{busy ? <Loader2 className="animate-spin" /> : <Save />} Publish course changes</Button>
      <Button variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => void publish(true)}><Trash2 /> Delete course from planner</Button>
    </div>
  </div>;
}
