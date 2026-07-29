import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireMaintainerUser } from "@/lib/adminAuth";
import { readCatalogBootstrap } from "@/lib/catalog/searchRepository";
import { getCatalogSourceStatuses } from "@/lib/catalogRepository";
import type { CatalogProgram, RequirementNode } from "@/lib/types";

const noStore = { "Cache-Control": "private, no-store" };

function nodeCounts(node: RequirementNode | null): { selectors: number; manuals: number } {
  if (!node) return { selectors: 0, manuals: 0 };
  const own = {
    selectors: node.kind === "choose" ? 1 : 0,
    manuals: node.kind === "manualConfirmation" ? 1 : 0,
  };
  const children =
    node.kind === "all" || node.kind === "any" || node.kind === "choose" || node.kind === "credits"
      ? node.children
      : node.kind === "exclusion"
        ? [node.child]
        : [];
  return children.reduce(
    (total, child) => {
      const count = nodeCounts(child);
      return { selectors: total.selectors + count.selectors, manuals: total.manuals + count.manuals };
    },
    own,
  );
}

export function bulletinProgramDiagnostics(programs: readonly CatalogProgram[]) {
  return [...programs]
    .filter((program) => program.auditAuthority === "nyush-bulletin")
    .map((program) => {
      const verified = program.interpretations.filter((item) => item.status === "verified");
      const counts = verified.reduce(
        (total, item) => {
          const count = nodeCounts(item.requirement);
          return { selectors: total.selectors + count.selectors, manuals: total.manuals + count.manuals };
        },
        { selectors: 0, manuals: 0 },
      );
      const unavailableGroups = program.interpretations
        .filter((item) => item.status === "unavailable")
        .map((item) => item.name)
        .sort((left, right) => left.localeCompare(right, "en"));
      return {
        programId: program.id,
        interpretationCoverage:
          program.interpretations.length === 0
            ? 0
            : verified.length / program.interpretations.length,
        unavailableGroups,
        selectorCount: counts.selectors,
        manualConfirmationCount: counts.manuals,
        samplePlanImportStatus: program.samplePlan?.importStatus ?? "absent",
      };
    })
    .sort((left, right) => left.programId.localeCompare(right.programId, "en"));
}

/** Read-only release and interpretation diagnostics for admins and maintainers. */
export async function GET() {
  const gate = await requireMaintainerUser();
  if (!("ok" in gate)) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status, headers: noStore },
    );
  }

  try {
    const [bootstrap, sources] = await Promise.all([
      readCatalogBootstrap(db),
      getCatalogSourceStatuses(db),
    ]);
    const programs = bulletinProgramDiagnostics(bootstrap.programs);
    const pass = programs.filter((program) => program.unavailableGroups.length === 0).length;
    return NextResponse.json(
      {
        releaseId: bootstrap.release.id,
        activeCourseCount: sources.reduce((sum, source) => sum + source.activeCourseCount, 0),
        summary: { programCount: programs.length, pass, partial: programs.length - pass },
        programs,
      },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(
      { error: "bulletin status unavailable" },
      { status: 500, headers: noStore },
    );
  }
}
