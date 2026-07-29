import type { BulletinTableBlock } from "@/lib/bulletin/displayTypes";
import type { CatalogProgram, RequirementNode } from "@/lib/types";

export interface CertifiedSelector {
  label: string;
  count: number;
  childCount: number;
}

export interface ProgramGoldenExpectation {
  programId: string;
  tableHeadings: string[];
  categoryNames: string[];
  selectors: CertifiedSelector[];
  manualConditions: string[];
  unavailableGroups: string[];
  samplePlanTermCount: number;
}

export interface ProgramCertificationResult {
  programId: string;
  status: "pass" | "fail";
  tableHeadings: string[];
  categoryNames: string[];
  selectors: CertifiedSelector[];
  manualConditions: string[];
  unavailableGroups: string[];
  samplePlan: {
    termCount: number;
    placeholders: number;
    unresolvedCourses: string[];
  } | null;
  errors: string[];
}

export interface ProgramCertificationReport {
  status: "pass" | "fail";
  programCount: number;
  passed: number;
  failed: number;
  programs: ProgramCertificationResult[];
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function tables(program: CatalogProgram): BulletinTableBlock[] {
  return (
    program.bulletinDisplay?.sections.flatMap((section) =>
      section.blocks.filter(
        (block): block is BulletinTableBlock => block.kind === "table",
      ),
    ) ?? []
  );
}

function collectNodeFacts(
  node: RequirementNode,
  label: string,
  selectors: CertifiedSelector[],
  manualConditions: string[],
): void {
  if (node.kind === "choose") {
    selectors.push({ label, count: node.count, childCount: node.children.length });
  }
  if (node.kind === "manualConfirmation") {
    manualConditions.push(node.sourceText);
  }
  if (
    node.kind === "all" ||
    node.kind === "any" ||
    node.kind === "choose" ||
    node.kind === "credits"
  ) {
    node.children.forEach((child) =>
      collectNodeFacts(child, label, selectors, manualConditions),
    );
  } else if (node.kind === "exclusion") {
    collectNodeFacts(node.child, label, selectors, manualConditions);
  }
}

function sortedSelectors(selectors: readonly CertifiedSelector[]) {
  return [...selectors].sort(
    (left, right) =>
      compareText(left.label, right.label) ||
      left.count - right.count ||
      left.childCount - right.childCount,
  );
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function inspectProgram(program: CatalogProgram): ProgramCertificationResult {
  const selectors: CertifiedSelector[] = [];
  const manualConditions: string[] = [];
  for (const interpretation of program.interpretations) {
    if (interpretation.requirement) {
      collectNodeFacts(
        interpretation.requirement,
        interpretation.name,
        selectors,
        manualConditions,
      );
    }
  }
  const samplePlan = program.samplePlan
    ? {
        termCount: program.samplePlan.terms.length,
        placeholders: program.samplePlan.terms.reduce(
          (count, term) =>
            count + term.rows.filter((row) => row.kind === "placeholder").length,
          0,
        ),
        unresolvedCourses: uniqueSorted(
          program.samplePlan.diagnostics
            .filter((diagnostic) => diagnostic.code === "unresolved-course")
            .map((diagnostic) => diagnostic.message),
        ),
      }
    : null;
  const unavailableGroups = uniqueSorted(
    program.interpretations
      .filter((interpretation) => interpretation.status === "unavailable")
      .map((interpretation) => interpretation.name),
  );
  return {
    programId: program.id,
    status: "pass",
    tableHeadings: uniqueSorted(
      tables(program).map(
        (table) =>
          table.headingTrail.at(-1)?.text ?? table.caption ?? table.id,
      ),
    ),
    categoryNames: uniqueSorted(program.categories.map((category) => category.name)),
    selectors: sortedSelectors(selectors),
    manualConditions: uniqueSorted(manualConditions),
    unavailableGroups,
    samplePlan,
    errors: unavailableGroups.length > 0 ? ["unavailable-interpretation"] : [],
  };
}

function compareWithGolden(
  result: ProgramCertificationResult,
  golden: ProgramGoldenExpectation | undefined,
): void {
  if (!golden) {
    result.errors.push("missing-golden-program");
    return;
  }
  if (!equal(result.tableHeadings, uniqueSorted(golden.tableHeadings))) {
    result.errors.push("table-heading-mismatch");
  }
  if (!equal(result.categoryNames, uniqueSorted(golden.categoryNames))) {
    result.errors.push("category-name-mismatch");
  }
  if (!equal(result.selectors, sortedSelectors(golden.selectors))) {
    result.errors.push("selector-mismatch");
  }
  if (!equal(result.manualConditions, uniqueSorted(golden.manualConditions))) {
    result.errors.push("manual-condition-mismatch");
  }
  if (!equal(result.unavailableGroups, uniqueSorted(golden.unavailableGroups))) {
    result.errors.push("unavailable-group-mismatch");
  }
  if ((result.samplePlan?.termCount ?? 0) !== golden.samplePlanTermCount) {
    result.errors.push("sample-plan-term-count-mismatch");
  }
}

export function certifyShanghaiPrograms(
  programs: readonly CatalogProgram[],
  golden: readonly ProgramGoldenExpectation[],
): ProgramCertificationReport {
  const expectedById = new Map(golden.map((entry) => [entry.programId, entry]));
  const results = programs
    .filter((program) =>
      program.provenance.sourceUrl.includes("/undergraduate/shanghai/"),
    )
    .map((program) => {
      const result = inspectProgram(program);
      compareWithGolden(result, expectedById.get(program.id));
      result.errors = uniqueSorted(result.errors);
      result.status = result.errors.length === 0 ? "pass" : "fail";
      return result;
    })
    .sort((left, right) => compareText(left.programId, right.programId));

  const presentIds = new Set(results.map((result) => result.programId));
  for (const expected of golden) {
    if (!presentIds.has(expected.programId)) {
      results.push({
        programId: expected.programId,
        status: "fail",
        tableHeadings: [],
        categoryNames: [],
        selectors: [],
        manualConditions: [],
        unavailableGroups: [],
        samplePlan: null,
        errors: ["missing-candidate-program"],
      });
    }
  }
  results.sort((left, right) => compareText(left.programId, right.programId));
  const passed = results.filter((result) => result.status === "pass").length;
  return {
    status: passed === results.length ? "pass" : "fail",
    programCount: results.length,
    passed,
    failed: results.length - passed,
    programs: results,
  };
}
