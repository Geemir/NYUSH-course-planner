"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ProgramStatus {
  programId: string;
  interpretationCoverage: number;
  unavailableGroups: string[];
  selectorCount: number;
  manualConfirmationCount: number;
  samplePlanImportStatus: "eligible" | "display-only" | "absent";
}

interface StatusPayload {
  releaseId: string;
  activeCourseCount: number;
  summary: { programCount: number; pass: number; partial: number };
  programs: ProgramStatus[];
}

export function BulletinCertificationStatus() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [partialOnly, setPartialOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/bulletin/status", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("status unavailable");
        return response.json() as Promise<StatusPayload>;
      })
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <section className="flex items-center gap-2 rounded-2xl border bg-card/60 p-5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading Bulletin certification…</section>;
  }
  if (failed || !data) {
    return <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">Bulletin certification status could not be loaded.</p>;
  }

  const visible = partialOnly
    ? data.programs.filter((program) => program.unavailableGroups.length > 0)
    : data.programs;
  return (
    <section className="flex flex-col gap-5 rounded-2xl border bg-card/70 p-4 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="size-5 text-primary" /> Bulletin certification</h2>
          <p className="mt-1 text-sm text-muted-foreground">Active release {data.releaseId} · {data.activeCourseCount} courses. Read-only diagnostics; official tables remain the source of truth.</p>
        </div>
        <Button type="button" variant={partialOnly ? "default" : "outline"} onClick={() => setPartialOnly((value) => !value)}>Partial only</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-background p-3"><span className="text-2xl font-semibold">{data.summary.programCount}</span><span className="block text-xs text-muted-foreground">Programs</span></div>
        <div className="rounded-xl border bg-background p-3"><span className="text-2xl font-semibold text-emerald-600">{data.summary.pass}</span><span className="block text-xs text-muted-foreground">Fully interpreted</span></div>
        <div className="col-span-2 rounded-xl border bg-background p-3 sm:col-span-1"><span className="text-2xl font-semibold text-amber-600">{data.summary.partial}</span><span className="block text-xs text-muted-foreground">Partial</span></div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {visible.map((program) => {
          const complete = program.unavailableGroups.length === 0;
          return <article key={program.programId} className="min-w-0 rounded-xl border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="truncate font-mono text-sm font-medium">{program.programId}</h3>
              <Badge variant={complete ? "default" : "secondary"}>{complete ? <CheckCircle2 className="size-3" /> : <TriangleAlert className="size-3" />}{Math.round(program.interpretationCoverage * 100)}%</Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{program.selectorCount} selectors · {program.manualConfirmationCount} manual conditions · sample plan {program.samplePlanImportStatus}</p>
            {program.unavailableGroups.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{program.unavailableGroups.map((group) => <Badge key={group} variant="outline">{group}</Badge>)}</div>}
          </article>;
        })}
      </div>
    </section>
  );
}
