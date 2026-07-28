"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  ExternalLink,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";
import { ReportIssueDialog } from "@/components/corrections/ReportIssueDialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import type { ClientPlannerProgram } from "@/lib/catalogClient";
import type {
  CategoryProgress,
  FulfillmentFact,
  RequirementGap,
  RequirementNode,
} from "@/lib/types";
import { semesterTermName } from "@/lib/types";
import { usePlannerStore } from "@/store/plannerStore";

type EvidenceRequirement = {
  factId: string;
  kind: "waiver" | "manualConfirmation";
  requirementId: string;
  label: string;
  sourceText: string;
};

function unitsLabel(category: CategoryProgress): string {
  const suffix = category.unitKind === "credits" ? " cr" : "";
  return `${category.completedUnits} earned · ${category.plannedUnits} planned / ${category.requiredUnits}${suffix}`;
}

function evidenceRequirements(
  program: ClientPlannerProgram,
  categoryId: string,
): EvidenceRequirement[] {
  const category = program.categories.find((item) => item.id === categoryId);
  if (!category || !("requirement" in category)) return [];
  const rows = "requirementRows" in program ? program.requirementRows : [];
  const evidence: EvidenceRequirement[] = [];

  const visit = (node: RequirementNode, path: number[]) => {
    const sourceText =
      rows.find(
        (row) =>
          row.categoryId === categoryId &&
          row.nodePath.length === path.length &&
          row.nodePath.every((part, index) => part === path[index]),
      )?.sourceText;

    if (node.kind === "waiver") {
      evidence.push({
        factId: `waiver:${program.id}:${categoryId}:${path.join("-") || "root"}`,
        kind: "waiver",
        requirementId: node.waiverId,
        label: node.label,
        sourceText: sourceText ?? node.label,
      });
      return;
    }
    if (node.kind === "manualConfirmation") {
      evidence.push({
        factId: `manual:${program.id}:${categoryId}:${path.join("-") || "root"}`,
        kind: "manualConfirmation",
        requirementId: node.sourceText,
        label: node.label,
        sourceText: sourceText ?? node.sourceText,
      });
      return;
    }
    if (node.kind === "exclusion") {
      visit(node.child, [...path, 0]);
      return;
    }
    if (
      node.kind === "all" ||
      node.kind === "any" ||
      node.kind === "choose" ||
      node.kind === "credits"
    ) {
      node.children.forEach((child, index) => visit(child, [...path, index]));
    }
  };

  visit(category.requirement, []);
  return evidence;
}

function EvidenceRow({ item }: { item: EvidenceRequirement }) {
  const facts = usePlannerStore((state) => state.fulfillmentFacts);
  const recordFact = usePlannerStore((state) => state.recordFulfillmentFact);
  const removeFact = usePlannerStore((state) => state.removeFulfillmentFact);
  const fact = facts.find(
    (candidate) =>
      candidate.kind === item.kind &&
      candidate.requirementId === item.requirementId,
  );
  const isManual = item.kind === "manualConfirmation";
  const label = isManual ? "Confirmation required" : "Waiver available";
  const action = isManual ? "confirmation" : "waiver";

  const addFact = () => {
    const next: FulfillmentFact = {
      id: item.factId,
      kind: item.kind,
      requirementId: item.requirementId,
      label: item.label,
    };
    recordFact(next);
  };

  return (
    <li
      data-testid={isManual ? "manual-requirement" : "waiver-requirement"}
      className="flex flex-col gap-2 rounded-lg bg-muted/45 p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck
            className={
              fact
                ? "size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                : "size-4 shrink-0 text-muted-foreground"
            }
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold">{item.label}</p>
            {/* Planner status — compact, sans, and status-colored. */}
            <p
              className={`text-[11px] font-semibold ${
                fact
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}
            >
              {fact ? "Recorded as fulfilled" : label}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant={fact ? "ghost" : "outline"}
          size="sm"
          className="min-h-9"
          onClick={() => (fact ? removeFact(fact.id) : addFact())}
        >
          {fact ? `Remove ${action}` : `Record ${action}`}
        </Button>
      </div>
      {/* Verbatim Bulletin text — distinct serif/italic quote, not planner UI. */}
      <figure className="max-w-[65ch] rounded-lg bg-primary/5 px-3 py-2.5">
        <figcaption className="text-[11px] font-medium text-muted-foreground">
          From the NYU Bulletin
        </figcaption>
        <blockquote className="mt-0.5 font-serif text-[13px] italic leading-relaxed text-foreground/80">
          {item.sourceText}
        </blockquote>
      </figure>
    </li>
  );
}

function MissingCourseList({ courseIds }: { courseIds: string[] }) {
  const { coursesById } = usePlanDerived();
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 6;
  if (courseIds.length === 0) return null;
  const shown = expanded ? courseIds : courseIds.slice(0, LIMIT);
  return (
    <>
      {shown.map((courseId) => (
        <li
          key={courseId}
          className="flex items-center gap-1.5 text-sm text-destructive/80"
        >
          <Circle className="size-3.5 shrink-0" />
          <span className="font-mono text-xs">{courseId}</span>
          <span className="truncate text-xs">{coursesById.get(courseId)?.title}</span>
          <span className="ml-auto shrink-0 text-[11px]">not planned</span>
        </li>
      ))}
      {courseIds.length > LIMIT && (
        <li className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {expanded ? "Show fewer" : `Show all ${courseIds.length} listed as required`}
          </button>
          {!expanded && (
            <span className="text-[11px] text-muted-foreground">
              — that&apos;s a lot; this may be a &ldquo;choose some&rdquo; requirement
              mis-read as &ldquo;take all&rdquo; (see the note above).
            </span>
          )}
        </li>
      )}
    </>
  );
}

function CategoryRow({
  category,
  program,
}: {
  category: CategoryProgress;
  program: ClientPlannerProgram;
}) {
  const [reporting, setReporting] = useState(false);
  const { placementByCourse, coursesById } = usePlanDerived();
  const completedSemesters = usePlannerStore((state) => state.completedSemesters);
  const startYear = usePlannerStore((state) => state.startYear);
  const done = category.plannedUnits >= category.requiredUnits;
  const evidence = evidenceRequirements(program, category.categoryId);
  const programCategory = program.categories.find(
    (item) => item.id === category.categoryId,
  );
  const sourceUrl =
    programCategory && "sourceUrl" in programCategory
      ? programCategory.sourceUrl
      : undefined;

  return (
    <section className="flex flex-col gap-2.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-medium">
            {category.isCapstone && <GraduationCap className="size-4" />}
            {category.name}
          </h4>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {unitsLabel(category)}
          </p>
        </div>
        <Badge variant={done ? "default" : "secondary"} className="text-xs">
          {done ? "Planned" : "In progress"}
        </Badge>
      </div>

      <ul className="flex flex-col gap-1.5">
        {category.matchedCourseIds.map((courseId) => {
          const placement = placementByCourse.get(courseId);
          const isDone =
            placement !== undefined &&
            completedSemesters.includes(placement.semesterId);
          return (
            <li
              key={courseId}
              className="flex items-center gap-1.5 text-sm text-muted-foreground"
            >
              {isDone ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
              ) : (
                <Circle className="size-3.5 shrink-0" />
              )}
              <span className="font-mono text-xs">{courseId}</span>
              <span className="truncate text-xs">
                {coursesById.get(courseId)?.title}
              </span>
              {placement && (
                <span className="ml-auto shrink-0 text-[11px]">
                  {semesterTermName(placement.semesterId, startYear)}
                </span>
              )}
            </li>
          );
        })}
        <MissingCourseList courseIds={category.missingCourseIds} />
        {category.gaps
          .filter((gap): gap is Extract<RequirementGap, { kind: "ambiguous" }> => gap.kind === "ambiguous")
          .map((gap, index) => (
            <li
              key={`${gap.label}:${index}`}
              className="rounded-lg border border-primary/25 bg-primary/5 p-2.5"
            >
              <p className="text-xs font-semibold text-primary">
                Your choice — {gap.label.toLowerCase()}
              </p>
              {gap.candidateCourseIds.length > 0 && (
                <>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Any of these count; you don&apos;t need them all:
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {gap.candidateCourseIds.slice(0, 6).map((courseId) => (
                      <span key={courseId} className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {courseId}
                      </span>
                    ))}
                    {gap.candidateCourseIds.length > 6 && (
                      <span className="px-1 text-[11px] text-muted-foreground">
                        +{gap.candidateCourseIds.length - 6} more in the catalog
                      </span>
                    )}
                  </p>
                </>
              )}
            </li>
          ))}
        {(evidence.length > 4 ? evidence.slice(0, 3) : evidence).map((item) => (
          <EvidenceRow key={item.factId} item={item} />
        ))}
        {evidence.length > 4 && (
          <li>
            <details className="group">
              <summary className="cursor-pointer list-none rounded-lg bg-muted/45 p-2.5 text-xs font-medium text-muted-foreground hover:bg-muted">
                <span className="group-open:hidden">Show {evidence.length - 3} more Bulletin rows needing review…</span>
                <span className="hidden group-open:inline">Hide extra Bulletin rows</span>
              </summary>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {evidence.slice(3).map((item) => (
                  <EvidenceRow key={item.factId} item={item} />
                ))}
              </ul>
            </details>
          </li>
        )}
      </ul>

      {sourceUrl && (
        <div className="flex flex-wrap items-center gap-2">
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary">View requirement in NYU Bulletin<ExternalLink className="size-3" /></a>
          <Button type="button" variant="ghost" size="sm" onClick={() => setReporting(true)}><AlertCircle />Report requirement issue</Button>
        </div>
      )}
      {sourceUrl && <ReportIssueDialog open={reporting} onOpenChange={setReporting} context={{
        target: { kind: "requirement", programId: program.id, requirementId: category.categoryId },
        catalogReleaseId: null, sourceUrl,
        sourceSnapshotId: "provenance" in program ? program.provenance.snapshotId : undefined,
        displayedValue: `${program.name}: ${category.name} — ${unitsLabel(category)}`,
        label: `${program.name} · ${category.name}`,
      }} />}
    </section>
  );
}

export function RequirementChecklist() {
  const { activeProgramObjs, progressByProgram } = usePlanDerived();
  const profile = usePlannerStore((state) => state.programProfile);

  const roleLabel = (programId: string) => {
    if (programId === profile.coreProgramId) return "Core";
    if (programId === profile.primaryMajorId) return "Primary major";
    if (programId === profile.secondMajorId) return "Second major";
    return "Minor";
  };

  return (
    <>
      <div
        role="note"
        className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100"
      >
        <p className="font-semibold">
          These requirements are auto-extracted — please verify them yourself.
        </p>
        <p className="mt-1">
          We use an LLM to read the NYU Bulletin, and it has a{" "}
          <strong>high chance of getting requirements wrong</strong> — a
          &ldquo;choose 2 of these&rdquo; can be mis-read as &ldquo;take all of
          these,&rdquo; and the Bulletin itself changes over time. That&rsquo;s
          why you can attach your own <em>confirmation records</em> to each
          requirement. Treat this page as a planning{" "}
          <strong>visualization, not an official audit</strong>: always check the{" "}
          <a
            className="underline"
            href="https://bulletins.nyu.edu/undergraduate/shanghai/#programstext"
            target="_blank"
            rel="noreferrer"
          >
            latest NYU Shanghai Bulletin
          </a>{" "}
          and your advisor before relying on it.
        </p>
      </div>
      <Accordion>
        {activeProgramObjs.map((program) => {
        const progress = progressByProgram.get(program.id);
        if (!progress) return null;
        return (
          <AccordionItem key={program.id} value={program.id}>
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: program.color }}
                />
                {program.name}
                <Badge variant="outline" className="text-[10px]">{roleLabel(program.id)}</Badge>
                <span className="text-xs font-normal tabular-nums text-muted-foreground">
                  {Math.round(progress.plannedFraction * 100)}%
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <p className="pb-2 text-xs text-muted-foreground">
                {"auditAuthority" in program && program.auditAuthority === "reviewed-nyush-overlay"
                  ? "Source: Reviewed planner overlay — confirm advisor-dependent combinations."
                  : "Source: NYU Shanghai Bulletin requirements."}
              </p>
              {"reviewedNotes" in program && program.reviewedNotes?.length ? <div className="mb-3 space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs"><p className="font-semibold text-primary">Maintainer-reviewed notes</p>{program.reviewedNotes.map((item) => <p key={item.overlayId}>{item.note}</p>)}</div> : null}
              <div className="flex flex-col divide-y">
                {progress.categories.map((category) => (
                  <CategoryRow
                    key={category.categoryId}
                    category={category}
                    program={program}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
      </Accordion>
    </>
  );
}
