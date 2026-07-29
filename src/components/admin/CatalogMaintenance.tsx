"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { CourseMaintenanceEditor } from "@/components/admin/CourseMaintenanceEditor";
import { RequirementMaintenanceEditor } from "@/components/admin/RequirementMaintenanceEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import type { DirectCatalogOverlayInput } from "@/lib/catalogMaintenance/types";
import type { CatalogProgram } from "@/lib/types";

interface OverlayHistory {
  overlay: { id: string; targetKey: string; patchType: string; status: "active" | "superseded"; reason: string | null };
  events: Array<{ id: string; eventType: string; reason: string; createdAt: string }>;
}
interface MaintenancePayload { releaseId: string; programs: CatalogProgram[]; overlays: OverlayHistory[] }

export function CatalogMaintenance() {
  const [data, setData] = useState<MaintenancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogCourseRecord[]>([]);
  const [selected, setSelected] = useState<CatalogCourseRecord | null>(null);
  const [searching, setSearching] = useState(false);
  const [historyReasons, setHistoryReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/catalog-maintenance", { cache: "no-store" });
    if (!response.ok) throw new Error("Catalog maintenance data is unavailable.");
    setData(await response.json() as MaintenancePayload);
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/catalog-maintenance", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Catalog maintenance data is unavailable.");
        return response.json() as Promise<MaintenancePayload>;
      })
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch((error: Error) => { if (!cancelled) toast.error(error.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const search = async () => {
    setSearching(true);
    try {
      const response = await fetch(`/api/catalog/courses?q=${encodeURIComponent(query)}&limit=20`, { cache: "no-store" });
      if (!response.ok) throw new Error("Course search failed.");
      setResults(((await response.json()) as { items: CatalogCourseRecord[] }).items);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Course search failed."); }
    finally { setSearching(false); }
  };
  const publish = async (input: DirectCatalogOverlayInput) => {
    const response = await fetch("/api/admin/catalog-maintenance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Publish failed.");
    toast.success("Catalog change published");
    await load();
  };
  const setActive = async (item: OverlayHistory, active: boolean) => {
    const reason = historyReasons[item.overlay.id]?.trim() ?? "";
    const response = await fetch(`/api/admin/catalog-maintenance/${encodeURIComponent(item.overlay.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active, reason }) });
    const body = await response.json();
    if (!response.ok) return toast.error(body.error ?? "Status change failed.");
    setHistoryReasons((current) => ({ ...current, [item.overlay.id]: "" }));
    toast.success(active ? "Overlay restored" : "Overlay reverted");
    await load();
  };

  if (loading) return <div className="flex items-center gap-2 rounded-2xl border p-5 text-sm text-muted-foreground"><Loader2 className="animate-spin" /> Loading catalog maintenance…</div>;
  if (!data) return <p role="alert" className="text-sm text-destructive">Catalog maintenance could not be loaded.</p>;

  return <section className="flex flex-col gap-8 rounded-2xl border bg-card/60 p-4 sm:p-6">
    <div><h2 className="text-xl font-semibold">Catalog maintenance</h2><p className="text-sm text-muted-foreground">Active release {data.releaseId}. Changes publish immediately as reversible overlays; Bulletin snapshots stay immutable.</p></div>
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">Course records</h3>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void search(); }}>
        <Input aria-label="Search courses to maintain" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code or title" className="flex-1" />
        <Button type="submit" disabled={searching}>{searching ? <Loader2 className="animate-spin" /> : <Search />} Search</Button>
      </form>
      {results.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{results.map((record) => <button key={record.stableId} type="button" className="rounded-xl border bg-background p-3 text-left hover:border-primary/40" onClick={() => setSelected(record)}><span className="font-mono text-xs text-primary">{record.code}</span><span className="block truncate text-sm font-medium">{record.course.title}</span></button>)}</div>}
      {selected && <CourseMaintenanceEditor key={selected.stableId} record={selected} releaseId={data.releaseId} onPublish={publish} />}
    </section>
    <section className="flex flex-col gap-4"><h3 className="text-lg font-semibold">Program requirements</h3><RequirementMaintenanceEditor programs={data.programs} releaseId={data.releaseId} onPublish={publish} /></section>
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-lg font-semibold"><History className="size-4" /> Change history</h3>
      {data.overlays.length === 0 ? <p className="text-sm text-muted-foreground">No direct catalog changes yet.</p> : data.overlays.map((item) => <div key={item.overlay.id} className="flex flex-col gap-3 rounded-xl border bg-background p-3">
        <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{item.overlay.targetKey}</span><Badge variant="outline">{item.overlay.patchType}</Badge><Badge variant={item.overlay.status === "active" ? "default" : "secondary"}>{item.overlay.status}</Badge></div>
        <p className="text-sm text-muted-foreground">{item.overlay.reason}</p>
        <div className="flex flex-col gap-2 sm:flex-row"><Input aria-label={`Reason to ${item.overlay.status === "active" ? "revert" : "restore"} ${item.overlay.targetKey}`} value={historyReasons[item.overlay.id] ?? ""} onChange={(event) => setHistoryReasons((current) => ({ ...current, [item.overlay.id]: event.target.value }))} placeholder="Required audit reason" className="flex-1" /><Button variant="outline" disabled={(historyReasons[item.overlay.id]?.trim().length ?? 0) < 3} onClick={() => void setActive(item, item.overlay.status !== "active")}>{item.overlay.status === "active" ? "Revert" : "Restore"}</Button></div>
      </div>)}
    </section>
  </section>;
}
