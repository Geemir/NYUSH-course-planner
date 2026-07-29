import {
  CatalogProgramSchema,
  type CatalogCategory,
  type CatalogProgram,
  type RequirementNode,
} from "@/lib/types";

export const CORE_IPC_TARGETS = [
  { id: "interdisciplinary-perspectives-on-china-courses", count: 2, childCount: 62 },
  { id: "mathematics-courses-relavant-exam-scores", count: 1, childCount: 3 },
  { id: "experimental-discovery-in-the-natural-world-courses-and-relevant-exams", count: 1, childCount: 22 },
  { id: "science-technology-and-society-courses", count: 1, childCount: 42 },
  { id: "algorithmic-thinking-courses-relevant-exams", count: 1, childCount: 11 },
] as const;

export type CoreIpcSummary = {
  id: string;
  kind: string;
  count: number | null;
  childCount: number;
};

export type CoreIpcRepairPlan = {
  candidate: CatalogProgram;
  changed: boolean;
  before: CoreIpcSummary[];
  after: CoreIpcSummary[];
};

function categoryFor(program: CatalogProgram, id: string): CatalogCategory {
  const categories = program.categories.filter((category) => category.id === id);
  if (categories.length !== 1) {
    throw new Error(
      `Core IPC category ${id} must appear exactly once; found ${categories.length}.`,
    );
  }
  return categories[0];
}

function groupedChildren(node: RequirementNode, id: string): RequirementNode[] {
  if (
    node.kind === "all" ||
    node.kind === "any" ||
    node.kind === "choose" ||
    node.kind === "credits"
  ) {
    return node.children;
  }
  throw new Error(
    `Core IPC category ${id} must use a grouped requirement; found ${node.kind}.`,
  );
}

function summaryFor(program: CatalogProgram): CoreIpcSummary[] {
  return CORE_IPC_TARGETS.map(({ id }) => {
    const requirement = categoryFor(program, id).requirement;
    return {
      id,
      kind: requirement.kind,
      count: requirement.kind === "choose" ? requirement.count : null,
      childCount: groupedChildren(requirement, id).length,
    };
  });
}

export function assertCoreIpcTarget(
  program: CatalogProgram,
): CoreIpcSummary[] {
  if (program.id !== "core") {
    throw new Error(`Expected Core program, found ${program.id}.`);
  }

  const summaries = summaryFor(program);
  summaries.forEach((summary, index) => {
    const expected = CORE_IPC_TARGETS[index];
    if (
      summary.kind !== "choose" ||
      summary.count !== expected.count ||
      summary.childCount !== expected.childCount
    ) {
      throw new Error(
        `Core IPC category ${summary.id}: expected choose ${expected.count} from ${expected.childCount} children; found ${summary.kind} ${summary.count ?? "without count"} from ${summary.childCount}.`,
      );
    }
  });
  return summaries;
}

export function planCoreIpcRepair(
  current: CatalogProgram,
  target: CatalogProgram,
): CoreIpcRepairPlan {
  if (current.id !== "core" || target.id !== "core") {
    throw new Error("Core IPC repair accepts only the Core program.");
  }

  assertCoreIpcTarget(target);
  for (const { id, childCount } of CORE_IPC_TARGETS) {
    const currentChildren = groupedChildren(
      categoryFor(current, id).requirement,
      id,
    );
    const targetChildren = groupedChildren(
      categoryFor(target, id).requirement,
      id,
    );
    if (
      currentChildren.length !== childCount ||
      JSON.stringify(currentChildren) !== JSON.stringify(targetChildren)
    ) {
      throw new Error(
        `Core IPC category ${id} child list does not match the checked-in target.`,
      );
    }
  }

  const candidateInput = structuredClone(current);
  for (const { id } of CORE_IPC_TARGETS) {
    categoryFor(candidateInput, id).requirement = structuredClone(
      categoryFor(target, id).requirement,
    );
  }
  const candidate = CatalogProgramSchema.parse(candidateInput);
  const after = assertCoreIpcTarget(candidate);

  return {
    candidate,
    changed: JSON.stringify(candidate) !== JSON.stringify(current),
    before: summaryFor(current),
    after,
  };
}
