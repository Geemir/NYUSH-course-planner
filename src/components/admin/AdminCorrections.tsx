"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, GitMerge, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CorrectionStatusTimeline, correctionStatusLabel } from "@/components/corrections/CorrectionStatusTimeline";
import type { AdminCorrectionDetail, CorrectionStatus } from "@/lib/corrections/types";

type Page = { items: AdminCorrectionDetail[]; counts: Partial<Record<CorrectionStatus, number>>; nextCursor: string | null };
const statuses: Array<CorrectionStatus | "all"> = ["all", "submitted", "in_review", "needs_information", "approved", "applied", "rejected"];

export function AdminCorrections() {
  const [page, setPage] = useState<Page>({ items: [], counts: {}, nextCursor: null });
  const [selected, setSelected] = useState<AdminCorrectionDetail | null>(null);
  const [status, setStatus] = useState<CorrectionStatus | "all">("submitted");
  const [q, setQ] = useState(""); const [targetKind, setTargetKind] = useState("all");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [publicNote, setPublicNote] = useState(""); const [privateNote, setPrivateNote] = useState("");
  const [assignToSelf, setAssignToSelf] = useState(false); const [error, setError] = useState("");
  const [canonicalId, setCanonicalId] = useState(""); const [mergeReason, setMergeReason] = useState("");
  const [courseTitle, setCourseTitle] = useState(""); const [courseDescription, setCourseDescription] = useState("");
  const [minCredits, setMinCredits] = useState(""); const [maxCredits, setMaxCredits] = useState("");
  const [requirementAction, setRequirementAction] = useState("add_fulfillment"); const [courseStableId, setCourseStableId] = useState("");
  const [programNote, setProgramNote] = useState(""); const [sourceUrl, setSourceUrl] = useState("");

  const load = useCallback(async () => {
    setState("loading"); setError("");
    try {
      const params = new URLSearchParams({ limit: "40" }); if (status !== "all") params.set("status", status); if (q.trim()) params.set("q", q.trim()); if (targetKind !== "all") params.set("targetKind", targetKind);
      const response = await fetch(`/api/admin/corrections?${params}`); if (!response.ok) throw new Error();
      const result = await response.json() as Page; setPage(result); setSelected((current) => current ? result.items.find((item) => item.id === current.id) ?? current : result.items[0] ?? null); setState("ready");
    } catch { setState("error"); }
  }, [q, status, targetKind]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const mutate = async (path: string, body: unknown) => {
    if (!selected) return;
    setError("");
    const response = await fetch(`/api/admin/corrections/${selected.id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) { setError(result.error === "stale_target" ? "The active catalog changed. Re-open the source target before applying." : `Action failed: ${result.error ?? "unknown error"}`); return; }
    setSelected("request" in result ? result.request : result); setPublicNote(""); setPrivateNote(""); await load();
  };

  const transition = (toStatus: CorrectionStatus) => void mutate("transition", { toStatus, publicNote: publicNote.trim() || undefined, privateNote: privateNote.trim() || undefined, assignToSelf });
  const overlay = useMemo(() => {
    if (!selected) return null;
    if (selected.target.kind === "course") {
      const changes = { ...(courseTitle.trim() ? { title: courseTitle.trim() } : {}), ...(courseDescription.trim() ? { description: courseDescription.trim() } : {}), ...(minCredits ? { minCredits: Number(minCredits) } : {}), ...(maxCredits ? { maxCredits: Number(maxCredits) } : {}) };
      return { kind: "course", stableId: selected.target.stableId, changes };
    }
    if (selected.target.kind === "requirement") return { kind: "requirement", programId: selected.target.programId, requirementId: selected.target.requirementId, action: requirementAction, ...(requirementAction === "note" ? { note: programNote.trim() } : { courseStableId: courseStableId.trim() }) };
    if (selected.target.kind === "program") return { kind: "program-note", programId: selected.target.programId, note: programNote.trim(), sourceUrl: sourceUrl.trim() };
    return null;
  }, [courseDescription, courseStableId, courseTitle, maxCredits, minCredits, programNote, requirementAction, selected, sourceUrl]);

  const apply = () => {
    if (!overlay || !window.confirm(`Apply this reviewed overlay?\n\n${JSON.stringify(overlay, null, 2)}`)) return;
    void mutate("apply", overlay);
  };

  return <section className="rounded-2xl border bg-card" aria-labelledby="corrections-heading">
    <div className="border-b p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="corrections-heading" className="text-lg font-semibold">Correction Hub</h2><p className="text-sm text-muted-foreground">Review student evidence before changing planner overlays.</p></div><Button variant="outline" onClick={() => void load()}><RefreshCw />Refresh</Button></div>
      <div className="mt-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Correction status">{statuses.map((item) => <button key={item} role="tab" aria-selected={status === item} onClick={() => setStatus(item)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${status === item ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{item === "all" ? "All" : correctionStatusLabel[item]}{item !== "all" ? ` ${page.counts[item] ?? 0}` : ""}</button>)}</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_12rem]"><label className="relative"><Search className="absolute top-3 left-3 size-4 text-muted-foreground" /><Input aria-label="Search reports" className="h-11 pl-9" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search title or evidence…" /></label><select aria-label="Target type" className="h-11 rounded-lg border bg-background px-3" value={targetKind} onChange={(event) => setTargetKind(event.target.value)}><option value="all">All targets</option><option value="course">Courses</option><option value="requirement">Requirements</option><option value="program">Programs</option><option value="other">Other</option></select></div>
    </div>
    {state === "error" && <p role="alert" className="m-5 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">Correction inbox could not be loaded.</p>}
    <div className="grid min-h-[34rem] md:grid-cols-[18rem_1fr]">
      <div className="border-r p-2">{state === "loading" && !page.items.length && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}{state === "ready" && !page.items.length && <p className="p-4 text-sm text-muted-foreground">No reports match these filters.</p>}{page.items.map((item) => <button key={item.id} type="button" onClick={() => setSelected(item)} className={`mb-1 w-full rounded-xl p-3 text-left ${selected?.id === item.id ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-muted"}`}><span className="text-[11px] font-medium uppercase text-primary">{correctionStatusLabel[item.status]}</span><p className="line-clamp-2 text-sm font-medium">{item.title}</p><p className="truncate text-xs text-muted-foreground">{item.target.kind} · {item.ownerUserId}</p></button>)}</div>
      <div className="p-5">{selected ? <div className="space-y-6">
        <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{selected.title}</h3><span className="rounded-full bg-muted px-2 py-1 text-xs">{correctionStatusLabel[selected.status]}</span></div><p className="mt-2 text-sm leading-6">{selected.description}</p>{selected.suggestedCorrection && <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="text-xs font-semibold uppercase text-primary">Student suggestion</p><p className="mt-1 text-sm">{selected.suggestedCorrection}</p></div>}</div>
        <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase text-muted-foreground">Source truth</p><p className="mt-1 text-sm">{selected.context.displayedValue ?? "No captured display value"}</p>{selected.context.sourceUrl && <a href={selected.context.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-primary">Open source reference</a>}</div><div><p className="text-xs font-semibold uppercase text-muted-foreground">Evidence</p><p className="mt-1 text-sm">Release {selected.catalogReleaseId ?? "not captured"}</p>{selected.evidenceUrl ? <a href={selected.evidenceUrl} target="_blank" rel="noreferrer" className="text-sm text-primary">Open student evidence</a> : <p className="text-sm text-muted-foreground">No external evidence</p>}</div></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">Public note<Textarea value={publicNote} onChange={(event) => setPublicNote(event.target.value)} placeholder="Visible to the student" /></label><label className="grid gap-1 text-sm font-medium">Private reviewer note<Textarea value={privateNote} onChange={(event) => setPrivateNote(event.target.value)} placeholder="Maintainers only" /></label></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={assignToSelf} onChange={(event) => setAssignToSelf(event.target.checked)} />Assign to me with this action</label>
        <div className="flex flex-wrap gap-2">{selected.status === "submitted" && <Button onClick={() => transition("in_review")}><ShieldCheck />Start review</Button>}{selected.status === "needs_information" && <Button onClick={() => transition("in_review")}>Resume review</Button>}{selected.status === "in_review" && <><Button variant="outline" onClick={() => transition("needs_information")}>Request information</Button><Button onClick={() => transition("approved")}><CheckCircle2 />Approve</Button></>}{!["applied", "rejected"].includes(selected.status) && <Button variant="destructive" onClick={() => transition("rejected")}>Reject</Button>}</div>
        {selected.status === "approved" && <div className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50/60 p-4 dark:bg-emerald-950/20"><h4 className="font-semibold">Typed planner overlay</h4>{selected.target.kind === "course" && <div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Corrected title" value={courseTitle} onChange={(event) => setCourseTitle(event.target.value)} placeholder="Corrected title" /><Input aria-label="Minimum credits" type="number" value={minCredits} onChange={(event) => setMinCredits(event.target.value)} placeholder="Minimum credits" /><Input aria-label="Maximum credits" type="number" value={maxCredits} onChange={(event) => setMaxCredits(event.target.value)} placeholder="Maximum credits" /><Textarea aria-label="Corrected description" value={courseDescription} onChange={(event) => setCourseDescription(event.target.value)} placeholder="Corrected description" className="sm:col-span-2" /></div>}{selected.target.kind === "requirement" && <div className="grid gap-2"><select aria-label="Requirement action" className="h-11 rounded-lg border bg-background px-3" value={requirementAction} onChange={(event) => setRequirementAction(event.target.value)}><option value="add_fulfillment">Add fulfillment</option><option value="remove_fulfillment">Remove fulfillment</option><option value="exclude_course">Exclude course</option><option value="note">Add explanatory note</option></select>{requirementAction === "note" ? <Textarea aria-label="Reviewed requirement note" value={programNote} onChange={(event) => setProgramNote(event.target.value)} /> : <Input aria-label="Course stable ID" value={courseStableId} onChange={(event) => setCourseStableId(event.target.value)} />}</div>}{selected.target.kind === "program" && <div className="grid gap-2"><Textarea aria-label="Reviewed program note" value={programNote} onChange={(event) => setProgramNote(event.target.value)} /><Input aria-label="Program note source URL" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></div>}<pre className="max-h-44 overflow-auto rounded-lg bg-background p-3 text-xs">{JSON.stringify(overlay, null, 2)}</pre><Button onClick={apply} disabled={!overlay}><CheckCircle2 />Confirm and apply</Button></div>}
        {!selected.withdrawnAt && !["applied", "rejected"].includes(selected.status) && <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium"><GitMerge className="mr-2 inline size-4" />Merge as duplicate</summary><p className="mt-2 text-xs text-muted-foreground">The duplicate author sees only the public reason, never the canonical student&apos;s report.</p><div className="mt-3 grid gap-2"><Input aria-label="Canonical report ID" value={canonicalId} onChange={(event) => setCanonicalId(event.target.value)} /><Textarea aria-label="Public merge reason" value={mergeReason} onChange={(event) => setMergeReason(event.target.value)} /><Button variant="outline" onClick={() => void mutate("merge", { canonicalRequestId: canonicalId, publicNote: mergeReason })}>Merge duplicate</Button></div></details>}
        {error && <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="size-4" />{error}</p>}
        <div><h4 className="mb-3 font-semibold">Public audit timeline</h4><CorrectionStatusTimeline events={selected.events} />{selected.privateEvents.some((event) => event.privateNote) && <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/20"><p className="font-semibold">Private maintainer notes</p>{selected.privateEvents.filter((event) => event.privateNote).map((event) => <p key={event.id} className="mt-2">{event.privateNote}</p>)}</div>}</div>
      </div> : <p className="text-sm text-muted-foreground">Select a report to review its evidence.</p>}</div>
    </div>
  </section>;
}
