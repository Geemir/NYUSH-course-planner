import { describe, expect, it } from "vitest";
import fallback from "@/data/catalog-fallback.json";
import {
  assertCoreIpcTarget,
  CORE_IPC_TARGETS,
  planCoreIpcRepair,
} from "@/lib/catalog/coreIpcRepair";
import {
  CatalogProgramSchema,
  type CatalogProgram,
  type RequirementNode,
} from "@/lib/types";

function checkedInCore(): CatalogProgram {
  const input = fallback.programs.find((program) => program.id === "core");
  if (!input) throw new Error("Checked-in fallback has no Core program");
  return CatalogProgramSchema.parse(input);
}

function childrenOf(node: RequirementNode): RequirementNode[] {
  if (
    node.kind === "all" ||
    node.kind === "any" ||
    node.kind === "choose" ||
    node.kind === "credits"
  ) {
    return node.children;
  }
  throw new Error(`Expected a grouped requirement, received ${node.kind}`);
}

function staleCore(): CatalogProgram {
  const stale = structuredClone(checkedInCore());
  const targetIds = new Set<string>(CORE_IPC_TARGETS.map(({ id }) => id));
  stale.categories.forEach((category) => {
    if (!targetIds.has(category.id)) return;
    category.requirement = {
      kind: "all",
      children: structuredClone(childrenOf(category.requirement)),
    };
  });
  return CatalogProgramSchema.parse(stale);
}

describe("Core IPC repair planning", () => {
  it("replaces only the five stale requirement roots", () => {
    const current = staleCore();
    const target = checkedInCore();

    const repair = planCoreIpcRepair(current, target);

    expect(repair.changed).toBe(true);
    expect(
      repair.after.map(({ kind, count, childCount }) => ({
        kind,
        count,
        childCount,
      })),
    ).toEqual([
      { kind: "choose", count: 2, childCount: 62 },
      { kind: "choose", count: 1, childCount: 3 },
      { kind: "choose", count: 1, childCount: 22 },
      { kind: "choose", count: 1, childCount: 42 },
      { kind: "choose", count: 1, childCount: 11 },
    ]);
    expect(repair.candidate.provenance).toEqual(current.provenance);
    expect(repair.candidate.requirementRows).toEqual(current.requirementRows);
    expect(repair.candidate.sourceRows).toEqual(current.sourceRows);

    const targetIds = new Set<string>(CORE_IPC_TARGETS.map(({ id }) => id));
    expect(
      repair.candidate.categories.filter(({ id }) => !targetIds.has(id)),
    ).toEqual(current.categories.filter(({ id }) => !targetIds.has(id)));
  });

  it("returns a no-op for an already-correct Core program", () => {
    const target = checkedInCore();

    const repair = planCoreIpcRepair(target, target);

    expect(repair.changed).toBe(false);
    expect(repair.candidate).toEqual(target);
    expect(assertCoreIpcTarget(repair.candidate)).toEqual(repair.after);
  });

  it("fails closed when the deployed child list differs from the target", () => {
    const current = staleCore();
    const category = current.categories.find(
      ({ id }) => id === CORE_IPC_TARGETS[0].id,
    );
    if (!category) throw new Error("Core IPC category missing from fixture");
    const children = childrenOf(category.requirement);
    category.requirement = { kind: "all", children: children.slice(0, -1) };

    expect(() => planCoreIpcRepair(current, checkedInCore())).toThrow(
      /child list does not match/i,
    );
  });

  it("rejects an incomplete or incorrectly counted target", () => {
    const target = checkedInCore();
    const category = target.categories.find(
      ({ id }) => id === CORE_IPC_TARGETS[0].id,
    );
    if (!category || category.requirement.kind !== "choose") {
      throw new Error("Core IPC category is not choose-N in fixture");
    }
    category.requirement.count = 3;

    expect(() => assertCoreIpcTarget(target)).toThrow(/expected choose 2/i);
  });
});
