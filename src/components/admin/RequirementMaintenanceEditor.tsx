"use client";

import { useMemo, useState } from "react";
import { Edit3, Plus, Save, Trash2 } from "lucide-react";
import { RequirementNodeEditor } from "@/components/admin/RequirementNodeEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DirectCatalogOverlayInput } from "@/lib/catalogMaintenance/types";
import type { CatalogCategory, CatalogProgram } from "@/lib/types";

export function RequirementMaintenanceEditor({ programs, releaseId = null, onPublish }: {
  programs: CatalogProgram[];
  releaseId?: string | null;
  onPublish: (input: DirectCatalogOverlayInput) => Promise<void>;
}) {
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const program = useMemo(() => programs.find((item) => item.id === programId) ?? programs[0], [programId, programs]);
  const [draft, setDraft] = useState<CatalogCategory | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!program) return <p className="text-sm text-muted-foreground">No active programs are available.</p>;

  const addCategory = () => setDraft({
    id: "new-category", name: "New category",
    requirement: { kind: "manualConfirmation", label: "Advisor confirmation", sourceText: "Verify against the Bulletin." },
    sourceUrl: program.provenance.sourceUrl, sourceTableId: "direct-maintenance", sourceRowIndexes: [0],
  });
  const publish = async (patch: DirectCatalogOverlayInput["patch"]) => {
    setBusy(true);
    try {
      await onPublish({ patch, reason: reason.trim(), sourceReleaseId: releaseId });
      setReason("");
    } finally { setBusy(false); }
  };

  return <div className="flex flex-col gap-5">
    <Select value={program.id} onValueChange={(value) => { if (value) setProgramId(value); setDraft(null); }}>
      <SelectTrigger aria-label="Program" className="w-full sm:w-80"><SelectValue /></SelectTrigger>
      <SelectContent>{programs.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
    </Select>
    <div className="grid gap-2">
      {program.categories.map((category) => <div key={category.id} className="flex flex-col gap-2 rounded-xl border bg-background p-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1"><p className="font-medium">{category.name}</p><p className="font-mono text-xs text-muted-foreground">{category.id} · {category.requirement.kind}</p></div>
        <Button variant="outline" size="sm" aria-label={`Edit ${category.name}`} onClick={() => setDraft(structuredClone(category))}><Edit3 /> Edit</Button>
        <Button variant="ghost" size="sm" aria-label={`Delete ${category.name}`} disabled={busy || reason.trim().length < 3} onClick={() => void publish({ kind: "requirement-delete", programId: program.id, categoryId: category.id })}><Trash2 /> Delete</Button>
      </div>)}
    </div>
    <Button variant="outline" aria-label="Add category" onClick={addCategory}><Plus /> Add category</Button>
    {draft && <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Category id<Input aria-label="Category id" value={draft.id} onChange={(event) => setDraft({ ...draft, id: event.target.value })} /></label>
        <label className="grid gap-1 text-sm">Category name<Input aria-label="Category name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      </div>
      <RequirementNodeEditor value={draft.requirement} onChange={(requirement) => setDraft({ ...draft, requirement })} />
      <Button disabled={busy || reason.trim().length < 3 || !draft.id.trim() || !draft.name.trim()} onClick={() => void publish({ kind: "requirement-upsert", programId: program.id, category: draft })}><Save /> Publish requirement</Button>
    </div>}
    <label className="grid gap-1 text-sm font-medium">Reason for requirement change<Textarea aria-label="Requirement change reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for every publish, delete, revert, or restore" /></label>
  </div>;
}
