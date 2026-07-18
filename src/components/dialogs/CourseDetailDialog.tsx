"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ExternalLink, PenLine } from "lucide-react";
import { useCatalog } from "@/components/CatalogProvider";
import { EditCourseForm } from "@/components/dialogs/EditCourseForm";
import { ReportIssueDialog } from "@/components/corrections/ReportIssueDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCourseData } from "@/hooks/useCourseData";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import { createCatalogClient, type CatalogClient } from "@/lib/catalogClient";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import { type Allocation, GRADES, type Grade, SEMESTER_IDS, type SemesterId, semesterFullLabel } from "@/lib/types";
import { usePlannerStore } from "@/store/plannerStore";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3><div className="text-sm">{children}</div></div>;
}

function stablePrerequisiteIds(record: CatalogCourseRecord): string[] {
  return [...new Set(record.course.prereqs.flat().filter((id) => id.includes(":")))];
}

export function CourseDetailDialog({
  stableId,
  courseId,
  onClose,
  client: injectedClient,
}: {
  stableId?: string | null;
  courseId?: string | null;
  onClose(): void;
  client?: CatalogClient;
}) {
  const { getRecord, ensureCourses, pinCourses, upsertRecords, bootstrap, programsById } = useCatalog();
  const { coursesById, customIds } = useCourseData();
  const derived = usePlanDerived();
  const [client] = useState(() => injectedClient ?? createCatalogClient());
  const [record, setRecord] = useState<CatalogCourseRecord | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [retryKey, setRetryKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const placeCourse = usePlannerStore((state) => state.placeCourse);
  const removeCourse = usePlannerStore((state) => state.removeCourse);
  const removeCustomCourse = usePlannerStore((state) => state.removeCustomCourse);
  const setExpectedGrade = usePlannerStore((state) => state.setExpectedGrade);
  const setAllocation = usePlannerStore((state) => state.setAllocation);
  const startYear = usePlannerStore((state) => state.startYear);
  const cached = stableId ? getRecord(stableId) : undefined;

  useEffect(() => {
    if (!stableId) return;
    let active = true;
    let controller: AbortController | null = null;
    queueMicrotask(() => {
      if (!active) return;
      pinCourses([stableId]);
      controller = new AbortController();
      controllerRef.current = controller;
      if (cached) {
        setRecord(cached);
        setStatus("ready");
        const prerequisites = stablePrerequisiteIds(cached);
        if (prerequisites.length) void ensureCourses(prerequisites);
        return;
      }
      setStatus("loading");
      setRecord(null);
      void (async () => {
        try {
          const next = await client.getCourse(stableId, controller!.signal);
          if (controller!.signal.aborted) return;
          upsertRecords([next]);
          setRecord(next);
          setStatus("ready");
          const prerequisites = stablePrerequisiteIds(next);
          if (prerequisites.length) await ensureCourses(prerequisites);
        } catch {
          if (!controller!.signal.aborted) setStatus("error");
        }
      })();
    });
    return () => { active = false; controller?.abort(); };
  }, [cached, client, ensureCourses, pinCourses, retryKey, stableId, upsertRecords]);

  const course = stableId ? record?.course : courseId ? coursesById.get(courseId) : undefined;
  const isCustom = course ? customIds.has(course.id) : false;
  const placement = stableId
    ? derived.placementByCatalogId.get(stableId)
    : course
      ? derived.placementByCustomCourse.get(course.id)
      : undefined;
  const placementId = placement && "placementId" in placement ? String(placement.placementId) : undefined;
  const source = record ? bootstrap.sources.find((item) => item.id === record.sourceId) : undefined;
  const publicationYear = new Date(bootstrap.release.publishedAt).getUTCFullYear();
  const prerequisiteLabels = useMemo(() => course?.prereqs.map((group) => group.map((id) => {
    const linked = getRecord(id);
    return linked ? `${linked.code} — ${linked.course.title}` : id;
  }).join(" or ")) ?? [], [course, getRecord]);
  const close = () => { controllerRef.current?.abort(); setEditing(false); onClose(); };

  if (!stableId && !courseId) return null;
  const placementInput = record
    ? { courseId: record.code, catalogCourseId: record.stableId, titleSnapshot: record.course.title.slice(0, 200) }
    : course
      ? { courseId: course.id, titleSnapshot: course.title.slice(0, 200) }
      : null;

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {status === "loading" && !course && <div aria-label="Loading course details" className="space-y-3"><div className="h-7 w-2/3 animate-pulse rounded bg-muted" /><div className="h-32 animate-pulse rounded bg-muted" /></div>}
        {status === "error" && !course && <div role="alert" className="space-y-3"><DialogHeader><DialogTitle>Course details unavailable</DialogTitle><DialogDescription>The catalog record could not be loaded. Your plan was not changed.</DialogDescription></DialogHeader><Button onClick={() => setRetryKey((value) => value + 1)}>Retry</Button></div>}
        {course && <>
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">{course.title}{isCustom && <Badge variant="outline">Custom</Badge>}{record && record.sourceId !== "nyu-shanghai" && <Badge variant="secondary">Catalog-only study-away course</Badge>}</DialogTitle>
            <DialogDescription>{course.id} · {course.department} · {course.credits} credits</DialogDescription>
          </DialogHeader>
          {editing && isCustom ? <EditCourseForm key={course.id} course={course} onDone={() => setEditing(false)} /> : <>
            <div className="space-y-4">
              {course.description && <p className="text-sm leading-6 text-muted-foreground">{course.description}</p>}
              {record && <div className="grid gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-2">
                <Row label="Official source"><span>{source?.schoolName ?? record.sourceId} · {source?.campus === "new-york" ? "New York" : "Shanghai"}</span></Row>
                <Row label="Catalog edition"><span>NYU Bulletin catalog · {publicationYear}</span></Row>
                <Row label="Release published"><time dateTime={bootstrap.release.publishedAt}>{new Date(bootstrap.release.publishedAt).toLocaleDateString("en-US")}</time></Row>
                <Row label="Source page">{course.provenance?.sourceUrl ? <a className="inline-flex items-center gap-1 text-primary underline" href={course.provenance.sourceUrl} target="_blank" rel="noreferrer">Open official Bulletin <ExternalLink className="size-3.5" /></a> : <span className="text-muted-foreground">Canonical URL unavailable</span>}</Row>
              </div>}
              {record && record.sourceId !== "nyu-shanghai" && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">New York study-away catalog. Availability and registration eligibility are not confirmed; Bulletin patterns are not a current class schedule.</p>}
              <Row label="Prerequisites">{prerequisiteLabels.length ? <ul className="list-inside list-disc space-y-1">{prerequisiteLabels.map((label) => <li key={label} className="font-mono text-xs">{label}<span className="ml-1 font-sans text-muted-foreground">(requirement only; not marked satisfied)</span></li>)}</ul> : <span className="text-muted-foreground">None listed</span>}</Row>
              <Row label="NYUSH degree mapping">{course.fulfills.length ? <div className="flex flex-wrap gap-1">{course.fulfills.map((item) => { const program = programsById.get(item.programId); const category = program?.categories.find((entry) => entry.id === item.categoryId); return <Badge key={`${item.programId}/${item.categoryId}`} variant="secondary">{program?.shortName ?? item.programId}: {category?.name ?? item.categoryId}</Badge>; })}</div> : <span className="text-muted-foreground">Not currently mapped to an NYUSH requirement. It may still count toward graduation credits.</span>}</Row>
              {record && <p className="text-xs text-muted-foreground">Evidence: active catalog release {bootstrap.release.id}; source snapshot {record.sourceSnapshotId}.</p>}
              {record?.reviewedOverlayIds?.length ? <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">This view includes {record.reviewedOverlayIds.length} maintainer-reviewed correction{record.reviewedOverlayIds.length === 1 ? "" : "s"}. Bulletin source evidence remains preserved.</p> : null}
              {placementInput && <Row label={placement ? "Semester" : "Add to semester"}><Select value={placement?.semesterId ?? null} onValueChange={(value) => placeCourse(placementId ?? placementInput, value as SemesterId)}><SelectTrigger size="sm" className="w-full"><SelectValue placeholder="Choose a semester…">{(value: SemesterId | null) => value ? semesterFullLabel(value, startYear) : "Choose a semester…"}</SelectValue></SelectTrigger><SelectContent>{SEMESTER_IDS.map((semesterId) => <SelectItem key={semesterId} value={semesterId}>{semesterFullLabel(semesterId, startYear)}</SelectItem>)}</SelectContent></Select></Row>}
              {placement && placementId && <Row label="Expected grade (optional)"><Select value={placement.expectedGrade ?? "none"} onValueChange={(value) => setExpectedGrade(placementId, value === "none" ? null : value as Grade)}><SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not set</SelectItem>{GRADES.map((grade) => <SelectItem key={grade} value={grade}>{grade}</SelectItem>)}</SelectContent></Select></Row>}
              {placement && placementId && course.fulfills.length > 0 && <Row label="Requirement allocation"><Select value={placement.allocation} onValueChange={(value) => setAllocation(placementId, value as Allocation)}><SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Automatic — use confirmed planner rules</SelectItem>{derived.activeProgramObjs.filter((program) => course.fulfills.some((item) => item.programId === program.id)).map((program) => <SelectItem key={program.id} value={program.id}>{program.shortName} only</SelectItem>)}{derived.activeProgramObjs.filter((program) => course.fulfills.some((item) => item.programId === program.id)).length > 1 && <SelectItem value="split">Both programs (when permitted)</SelectItem>}</SelectContent></Select><p className="mt-1 text-xs text-muted-foreground">Current automatic recipients: {derived.effectiveMajors(course.id).join(", ") || "none confirmed"}.{derived.allocation.budget ? ` Double-count budget: ${derived.allocation.budget.used}/${derived.allocation.budget.limit}.` : ""}</p></Row>}
              {record && <Button type="button" variant="ghost" size="sm" data-correction-entry={record.stableId} onClick={() => setReporting(true)}><AlertCircle />Report catalog issue</Button>}
            </div>
            <DialogFooter>
              {isCustom && <Button variant="outline" size="sm" onClick={() => setEditing(true)}><PenLine />Customize for my plan</Button>}
              {isCustom && <Button variant="outline" size="sm" onClick={() => { removeCustomCourse(course.id); close(); }}>Delete custom course</Button>}
              {placement && placementId && <Button variant="destructive" size="sm" onClick={() => { removeCourse(placementId); close(); }}>Remove from plan</Button>}
            </DialogFooter>
          </>}
        </>}
      </DialogContent>
      {record && <ReportIssueDialog open={reporting} onOpenChange={setReporting} context={{
        target: { kind: "course", stableId: record.stableId }, catalogReleaseId: bootstrap.release.id,
        sourceId: record.sourceId, sourceSnapshotId: record.sourceSnapshotId, schoolName: source?.schoolName,
        sourceUrl: course?.provenance?.sourceUrl, displayedValue: `${record.code} — ${record.course.title}`,
        label: `${record.code} · ${record.course.title}`,
      }} />}
    </Dialog>
  );
}
