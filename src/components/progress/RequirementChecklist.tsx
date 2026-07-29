"use client";

import { useState } from "react";
import { CheckCircle2, Circle, ShieldCheck } from "lucide-react";
import { useCatalog } from "@/components/CatalogProvider";
import { ReportIssueDialog, type ReportIssueContext } from "@/components/corrections/ReportIssueDialog";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { BulletinRequirements, type BulletinReportContext } from "@/components/progress/BulletinRequirements";
import { SampleStudyPlan } from "@/components/progress/SampleStudyPlan";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import type { ClientPlannerProgram } from "@/lib/catalogClient";
import type { CategoryProgress, FulfillmentFact, RequirementNode } from "@/lib/types";
import { usePlannerStore } from "@/store/plannerStore";

type EvidenceRequirement = {
  factId: string;
  kind: "waiver" | "manualConfirmation";
  requirementId: string;
  label: string;
};

function verifiedEvidence(program: ClientPlannerProgram): Map<string, EvidenceRequirement[]> {
  if (!("interpretations" in program)) return new Map();
  const result = new Map<string, EvidenceRequirement[]>();
  for (const interpretation of program.interpretations) {
    if (interpretation.status !== "verified" || !interpretation.requirement) continue;
    const evidence: EvidenceRequirement[] = [];
    const visit = (node: RequirementNode, path: number[]) => {
      if (node.kind === "waiver") {
        evidence.push({ factId: `waiver:${program.id}:${interpretation.id}:${path.join("-") || "root"}`, kind: "waiver", requirementId: node.waiverId, label: node.label });
        return;
      }
      if (node.kind === "manualConfirmation") {
        evidence.push({ factId: `manual:${program.id}:${interpretation.id}:${path.join("-") || "root"}`, kind: "manualConfirmation", requirementId: node.sourceText, label: node.label });
        return;
      }
      if (node.kind === "exclusion") return visit(node.child, [...path, 0]);
      if ("children" in node) node.children.forEach((child, index) => visit(child, [...path, index]));
    };
    visit(interpretation.requirement, []);
    if (evidence.length) result.set(interpretation.id, evidence);
  }
  return result;
}

function EvidenceControl({ item }: { item: EvidenceRequirement }) {
  const facts = usePlannerStore((state) => state.fulfillmentFacts);
  const add = usePlannerStore((state) => state.recordFulfillmentFact);
  const remove = usePlannerStore((state) => state.removeFulfillmentFact);
  const fact = facts.find((candidate) => candidate.kind === item.kind && candidate.requirementId === item.requirementId);
  const record = () => {
    const next: FulfillmentFact = { id: item.factId, kind: item.kind, requirementId: item.requirementId, label: item.label };
    add(next);
  };
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2">
      <span className="flex items-center gap-2 text-sm">
        <ShieldCheck aria-hidden="true" className={fact ? "size-4 text-emerald-600" : "size-4 text-muted-foreground"} />
        {item.label}
      </span>
      <Button type="button" size="sm" variant={fact ? "ghost" : "outline"} onClick={() => fact ? remove(fact.id) : record()}>
        {fact ? "Remove evidence" : item.kind === "waiver" ? "Record waiver" : "Confirm with evidence"}
      </Button>
    </li>
  );
}

function units(category: CategoryProgress): string {
  const suffix = category.unitKind === "credits" ? " cr" : "";
  return `${category.completedUnits} earned · ${category.plannedUnits} planned / ${category.requiredUnits}${suffix}`;
}

function PlannerInterpretation({ program, progress }: { program: ClientPlannerProgram; progress: { categories: CategoryProgress[] } }) {
  const evidenceByCategory = verifiedEvidence(program);
  return (
    <details className="mt-6 rounded-xl bg-muted/35 p-4 ring-1 ring-border">
      <summary className="cursor-pointer text-sm font-semibold">Planner interpretation · Beta</summary>
      <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">
        Calculated from verified requirements only. Use the Bulletin rows above as the source of truth.
      </p>
      <div className="mt-3 divide-y">
        {progress.categories.map((category) => {
          const done = category.plannedUnits >= category.requiredUnits;
          const evidence = evidenceByCategory.get(category.categoryId) ?? [];
          return (
            <section key={category.categoryId} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-medium">
                    {done ? <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-600" /> : <Circle aria-hidden="true" className="size-4 text-muted-foreground" />}
                    {category.name}
                  </h4>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">{units(category)}</p>
                </div>
                <Badge variant={done ? "default" : "secondary"}>{done ? "Planned" : "In progress"}</Badge>
              </div>
              {evidence.length > 0 && <ul className="mt-2 divide-y">{evidence.map((item) => <EvidenceControl key={item.factId} item={item} />)}</ul>}
            </section>
          );
        })}
      </div>
    </details>
  );
}

export function RequirementChecklist() {
  const { t } = useLocale();
  const { bootstrap } = useCatalog();
  const { activeProgramObjs, progressByProgram } = usePlanDerived();
  const placements = usePlannerStore((state) => state.placements);
  const completedSemesters = usePlannerStore((state) => state.completedSemesters);
  const profile = usePlannerStore((state) => state.programProfile);
  const [reportContext, setReportContext] = useState<ReportIssueContext | null>(null);

  const roleLabel = (programId: string) => {
    if (programId === profile.coreProgramId) return t("progress.core");
    if (programId === profile.primaryMajorId) return t("progress.primaryMajor");
    if (programId === profile.secondMajorId) return t("progress.secondMajor");
    return t("progress.minor");
  };

  const reportRow = (program: ClientPlannerProgram, row: BulletinReportContext) => {
    if (!("bulletinDisplay" in program) || !program.bulletinDisplay) return;
    setReportContext({
      target: { kind: "requirement", programId: program.id, requirementId: `${row.tableId}:${row.sourceIndex}` },
      catalogReleaseId: bootstrap.release.id,
      sourceSnapshotId: "provenance" in program ? program.provenance.snapshotId : undefined,
      sourceUrl: program.bulletinDisplay.sourceUrl,
      displayedValue: row.displayedValue,
      tableId: row.tableId,
      sourceIndex: row.sourceIndex,
      label: `${program.name} · ${row.displayedValue}`,
    });
  };

  return (
    <>
      <div role="note" className="mb-4 rounded-xl bg-primary/7 p-4 text-sm leading-6 text-foreground ring-1 ring-primary/20">
        {t("progress.bulletinNote")}
      </div>
      <Accordion>
        {activeProgramObjs.map((program) => {
          const progress = progressByProgram.get(program.id);
          if (!progress) return null;
          const display = "bulletinDisplay" in program ? program.bulletinDisplay : undefined;
          const samplePlan = "samplePlan" in program ? program.samplePlan : undefined;
          const authoritative = progress.authoritativePlannedFraction;
          return (
            <AccordionItem key={program.id} value={program.id}>
              <AccordionTrigger className="text-sm">
                <span className="flex flex-wrap items-center gap-2 text-left">
                  <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: program.color }} />
                  {program.name}
                  <Badge variant="outline" className="text-[10px]">{roleLabel(program.id)}</Badge>
                  {authoritative !== null ? (
                    <span className="text-xs font-normal tabular-nums text-muted-foreground">{Math.round(authoritative * 100)}%</span>
                  ) : (
                    <span className="text-xs font-normal text-muted-foreground">{progress.verifiedCategoryCount} of {progress.totalInterpretationCount} requirements verified</span>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {display ? (
                  <BulletinRequirements
                    programId={program.id}
                    programName={program.name}
                    catalogReleaseId={bootstrap.release.id}
                    sourceSnapshotId={"provenance" in program ? program.provenance.snapshotId : undefined}
                    display={display}
                    placements={placements}
                    completedSemesters={completedSemesters}
                    onReport={(row) => reportRow(program, row)}
                  />
                ) : (
                  <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">The source-faithful Bulletin view is unavailable for this legacy program.</p>
                )}
                <PlannerInterpretation program={program} progress={progress} />
                {samplePlan && <SampleStudyPlan programId={program.id} catalogReleaseId={bootstrap.release.id} samplePlan={samplePlan} />}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
      {reportContext && <ReportIssueDialog open onOpenChange={(open) => !open && setReportContext(null)} context={reportContext} />}
    </>
  );
}
