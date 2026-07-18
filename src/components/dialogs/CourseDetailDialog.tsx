"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ExternalLink, PenLine } from "lucide-react";
import { useCatalog } from "@/components/CatalogProvider";
import { EditCourseForm } from "@/components/dialogs/EditCourseForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCourseData } from "@/hooks/useCourseData";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import { createCatalogClient, type CatalogClient } from "@/lib/catalogClient";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import {
  GRADES,
  type Grade,
  SEMESTER_IDS,
  type SemesterId,
  semesterFullLabel,
} from "@/lib/types";
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
  const catalog = useCatalog();
  const {
    getRecord,
    ensureCourses,
    pinCourses,
    upsertRecords,
    bootstrap,
    programsById,
  } = catalog;
  const { coursesById, customIds } = useCourseData();
  const derived = usePlanDerived();
  const [client] = useState(() => injectedClient ?? createCatalogClient());
  const [record, setRecord] = useState<CatalogCourseRecord | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [retryKey, setRetryKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const placeCourse = usePlannerStore((state) => state.placeCourse);
  const removeCourse = usePlannerStore((state) => state.removeCourse);
  const removeCustomCourse = usePlannerStore((state) => state.removeCustomCourse);
  const setExpectedGrade = usePlannerStore((state) => state.setExpectedGrade);
  const startYear = usePlannerStore((state) => state.startYear);

  const cached = stableId ? getRecord(stableId) : undefined;
  useEffect(() => {
    if (!stableId) return;
    let active = true;
    let controller: AbortController | null = null;
    const hydratePrerequisites = async (next: CatalogCourseRecord) => {
      const prerequisiteIds = stablePrerequisiteIds(next);
      if (prerequisiteIds.length) await ensureCourses(prerequisiteIds);
    };
    queueMicrotask(() => {
      if (!active) return;
      pinCourses([stableId]);
      controller = new AbortController();
      controllerRef.current = controller;
      if (cached) {
        setRecord(cached);
        setStatus("ready");
        void hydratePrerequisites(cached);
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
          await hydratePrerequisites(next);
        } catch {
          if (!controller!.signal.aborted) setStatus("error");
        }
      })();
    });
    return () => {
      active = false;
      controller?.abort();
    };
  }, [cached, client, ensureCourses, pinCourses, retryKey, stableId, upsertRecords]);

  const course = stableId
    ? record?.course
    : courseId
      ? coursesById.get(courseId)
      : undefined;
  const isCustom = course ? customIds.has(course.id) : false;
  const placement = course ? derived.placementByCourse.get(course.id) : undefined;
  const source = record
    ? bootstrap.sources.find((item) => item.id === record.sourceId)
    : undefined;
  const publicationYear = new Date(bootstrap.release.publishedAt).getUTCFullYear();
  const prerequisiteLabels = useMemo(
    () => course?.prereqs.map((group) => group.map((id) => {
      const linked = getRecord(id);
      return linked ? `${linked.code} — ${linked.course.title}` : id;
    }).join(" or ")) ?? [],
    [course, getRecord],
  );

  const close = () => {
    controllerRef.current?.abort();
    setEditing(false);
    onClose();
  };

  if (!stableId && !courseId) return null;

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
              <Row label={placement ? "Semester" : "Add to semester"}><Select value={placement?.semesterId ?? null} onValueChange={(value) => placeCourse(course.id, value as SemesterId)}><SelectTrigger size="sm" className="w-full"><SelectValue placeholder="Choose a semester…">{(value: SemesterId | null) => value ? semesterFullLabel(value, startYear) : "Choose a semester…"}</SelectValue></SelectTrigger><SelectContent>{SEMESTER_IDS.map((semesterId) => <SelectItem key={semesterId} value={semesterId}>{semesterFullLabel(semesterId, startYear)}</SelectItem>)}</SelectContent></Select></Row>
              {placement && <Row label="Expected grade (optional)"><Select value={placement.expectedGrade ?? "none"} onValueChange={(value) => setExpectedGrade(course.id, value === "none" ? null : value as Grade)}><SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not set</SelectItem>{GRADES.map((grade) => <SelectItem key={grade} value={grade}>{grade}</SelectItem>)}</SelectContent></Select></Row>}
              {record && <Button type="button" variant="ghost" size="sm" data-correction-entry={record.stableId}><AlertCircle />Report catalog issue</Button>}
            </div>
            <DialogFooter>
              {isCustom && <Button variant="outline" size="sm" onClick={() => setEditing(true)}><PenLine />Edit course</Button>}
              {isCustom && <Button variant="outline" size="sm" onClick={() => { removeCustomCourse(course.id); close(); }}>Delete custom course</Button>}
              {placement && <Button variant="destructive" size="sm" onClick={() => { removeCourse(course.id); close(); }}>Remove from plan</Button>}
            </DialogFooter>
          </>}
        </>}
      </DialogContent>
    </Dialog>
  );
}
