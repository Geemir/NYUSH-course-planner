"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { CorrectionStatusTimeline, correctionStatusLabel } from "@/components/corrections/CorrectionStatusTimeline";
import type { CorrectionStatus, StudentCorrectionDetail, StudentCorrectionSummary } from "@/lib/corrections/types";

type Page = { items: StudentCorrectionSummary[]; nextCursor: string | null };

export function MyReportsSheet({ open, onOpenChange, initialReportId }: { open: boolean; onOpenChange(open: boolean): void; initialReportId?: string | null }) {
  const [items, setItems] = useState<StudentCorrectionSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<CorrectionStatus | "all">("all");
  const [detail, setDetail] = useState<StudentCorrectionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");

  const loadList = useCallback(async (append = false) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (status !== "all") params.set("status", status);
      if (append && cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/corrections?${params}`);
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in to view your reports." : "Reports could not be loaded.");
      const page = await response.json() as Page;
      setItems((current) => append ? [...current, ...page.items] : page.items); setCursor(page.nextCursor);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Reports could not be loaded."); }
    finally { setLoading(false); }
  }, [cursor, status]);

  const openDetail = useCallback(async (id: string) => {
    setLoading(true); setError("");
    try { const response = await fetch(`/api/corrections/${id}`); if (!response.ok) throw new Error("Report details could not be loaded."); setDetail(await response.json() as StudentCorrectionDetail); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Report details could not be loaded."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => { if (initialReportId) void openDetail(initialReportId); else void loadList(); });
  }, [open, initialReportId, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendReply = async () => {
    if (!detail || !reply.trim()) return;
    const response = await fetch(`/api/corrections/${detail.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: reply.trim() }) });
    if (!response.ok) { setError(response.status === 429 ? "Please wait before sending another reply." : "Reply could not be sent."); return; }
    setReply(""); await openDetail(detail.id);
  };
  const withdraw = async () => {
    if (!detail) return;
    const response = await fetch(`/api/corrections/${detail.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "withdraw" }) });
    if (!response.ok) { setError("This report can no longer be withdrawn."); return; }
    setDetail(await response.json() as StudentCorrectionDetail);
  };

  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="overflow-y-auto sm:max-w-lg">
    <SheetHeader><SheetTitle>{detail ? detail.title : "My reports"}</SheetTitle><SheetDescription>Track information you submitted to the planner maintainers.</SheetDescription></SheetHeader>
    {error && <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="size-4" />{error}</p>}
    {detail ? <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => { setDetail(null); void loadList(); }}><ArrowLeft />All reports</Button>
      <div className="rounded-xl border bg-muted/30 p-4"><p className="font-medium">{correctionStatusLabel[detail.status]}</p><p className="mt-2 text-sm text-muted-foreground">{detail.description}</p>{detail.evidenceUrl && <a className="mt-2 block text-sm text-primary" href={detail.evidenceUrl} target="_blank" rel="noreferrer">Open submitted evidence</a>}</div>
      <CorrectionStatusTimeline events={detail.events} />
      <section className="space-y-3"><h3 className="flex items-center gap-2 font-medium"><MessageSquareText className="size-4" />Conversation</h3>{detail.messages.length ? detail.messages.map((message) => <div key={message.id} className="rounded-lg bg-muted/45 p-3 text-sm"><p className="font-medium capitalize">{message.author}</p><p>{message.body}</p><time className="text-xs text-muted-foreground">{new Date(message.createdAt).toLocaleString("en-US")}</time></div>) : <p className="text-sm text-muted-foreground">No messages yet.</p>}
      {!detail.withdrawnAt && !["applied", "rejected"].includes(detail.status) && <><Textarea aria-label="Reply to maintainers" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Add information…" /><Button onClick={sendReply} disabled={!reply.trim()}>Send reply</Button></>}</section>
      {!detail.withdrawnAt && ["submitted", "needs_information"].includes(detail.status) && <Button variant="outline" onClick={withdraw}>Withdraw report</Button>}
      <p className="text-xs text-muted-foreground">Reviewed by the NYUSH Degree Planner maintainers; this is not an official NYU decision.</p>
    </div> : <div className="space-y-4">
      <label className="grid gap-1 text-sm font-medium">Status<select className="h-11 rounded-lg border bg-background px-3 font-normal" value={status} onChange={(event) => setStatus(event.target.value as CorrectionStatus | "all")}><option value="all">All statuses</option>{Object.entries(correctionStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {!loading && !items.length && !error && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">You have not submitted any reports in this view.</p>}
      <div className="space-y-2">{items.map((item) => <button key={item.id} type="button" onClick={() => void openDetail(item.id)} className="w-full rounded-xl border p-4 text-left transition-colors hover:bg-muted/45"><span className="text-xs font-medium text-primary">{correctionStatusLabel[item.status]}</span><p className="mt-1 font-medium">{item.title}</p><time className="text-xs text-muted-foreground">Updated {new Date(item.updatedAt).toLocaleDateString("en-US")}</time></button>)}</div>
      {cursor && <Button variant="outline" onClick={() => void loadList(true)} disabled={loading}>Load more</Button>}{loading && <p className="text-sm text-muted-foreground">Loading…</p>}
    </div>}
  </SheetContent></Sheet>;
}
