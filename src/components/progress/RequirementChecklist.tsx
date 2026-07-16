"use client";

import {
  CheckCircle2,
  Circle,
  ExternalLink,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";
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
      className="flex flex-col gap-2 border-l-2 border-border py-2 pl-3"
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
            <p className="text-xs text-muted-foreground">
              {fact ? "Recorded as fulfilled" : label}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant={fact ? "ghost" : "outline"}
          size="xs"
          onClick={() => (fact ? removeFact(fact.id) : addFact())}
        >
          {fact ? `Remove ${action}` : `Record ${action}`}
        </Button>
      </div>
      <blockquote className="max-w-[65ch] text-xs leading-relaxed text-muted-foreground">
        {item.sourceText}
      </blockquote>
    </li>
  );
}

function CategoryRow({
  category,
  program,
}: {
  category: CategoryProgress;
  program: ClientPlannerProgram;
}) {
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
        {category.missingCourseIds.map((courseId) => (
          <li
            key={courseId}
            className="flex items-center gap-1.5 text-sm text-destructive/80"
          >
            <Circle className="size-3.5 shrink-0" />
            <span className="font-mono text-xs">{courseId}</span>
            <span className="truncate text-xs">
              {coursesById.get(courseId)?.title}
            </span>
            <span className="ml-auto shrink-0 text-[11px]">not planned</span>
          </li>
        ))}
        {category.gaps
          .filter((gap) => gap.kind === "ambiguous")
          .map((gap) => (
            <li
              key={gap.label}
              className="text-xs leading-relaxed text-muted-foreground"
            >
              {gap.label}
            </li>
          ))}
        {evidence.map((item) => (
          <EvidenceRow key={item.factId} item={item} />
        ))}
      </ul>

      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary"
        >
          View requirement in NYU Bulletin
          <ExternalLink className="size-3" />
        </a>
      )}
    </section>
  );
}

export function RequirementChecklist() {
  const { activeProgramObjs, progressByProgram } = usePlanDerived();

  return (
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
                <span className="text-xs font-normal tabular-nums text-muted-foreground">
                  {Math.round(progress.plannedFraction * 100)}%
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
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
  );
}
