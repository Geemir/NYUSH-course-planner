import { describe, expect, it, vi } from "vitest";
import fallback from "@/data/catalog-fallback.json";
import {
  parseRepairArgs,
  runCoreIpcRepair,
  type CoreIpcRepairDependencies,
} from "./repair-core-ipc";
import { CORE_IPC_TARGETS } from "@/lib/catalog/coreIpcRepair";
import {
  CatalogProgramSchema,
  type CatalogProgram,
  type RequirementNode,
} from "@/lib/types";

function targetCore(): CatalogProgram {
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
  throw new Error(`Expected grouped requirement, found ${node.kind}`);
}

function staleCore(): CatalogProgram {
  const program = structuredClone(targetCore());
  const targetIds = new Set<string>(CORE_IPC_TARGETS.map(({ id }) => id));
  program.categories.forEach((category) => {
    if (!targetIds.has(category.id)) return;
    category.requirement = {
      kind: "all",
      children: structuredClone(childrenOf(category.requirement)),
    };
  });
  return CatalogProgramSchema.parse(program);
}

function dependencies(
  overrides: Partial<CoreIpcRepairDependencies> = {},
): CoreIpcRepairDependencies {
  return {
    readActiveRelease: vi.fn(async () => ({
      id: "release-123",
      shanghaiSnapshotId: "recovery-fallback",
    })),
    readCore: vi.fn(async () => staleCore()),
    compareAndSwap: vi.fn(async () => true),
    ...overrides,
  };
}

describe("parseRepairArgs", () => {
  it("defaults to dry-run", () => {
    expect(parseRepairArgs([])).toEqual({
      apply: false,
      expectedReleaseId: null,
    });
  });

  it("requires an expected release for writes", () => {
    expect(() => parseRepairArgs(["--apply"])).toThrow(/expected-release/i);
    expect(
      parseRepairArgs([
        "--apply",
        "--expected-release=release-123",
      ]),
    ).toEqual({ apply: true, expectedReleaseId: "release-123" });
  });

  it("rejects unknown options", () => {
    expect(() => parseRepairArgs(["--unknown"])).toThrow(/unknown option/i);
  });
});

describe("runCoreIpcRepair", () => {
  it("plans a dry-run without calling compare-and-swap", async () => {
    const deps = dependencies();
    const log = vi.fn();

    const result = await runCoreIpcRepair(
      { apply: false, expectedReleaseId: null },
      deps,
      targetCore(),
      log,
    );

    expect(result.status).toBe("dry-run");
    expect(deps.compareAndSwap).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("DRY RUN: no database changes");
  });

  it("applies one guarded update and verifies readback", async () => {
    const deps = dependencies({
      readCore: vi
        .fn<CoreIpcRepairDependencies["readCore"]>()
        .mockResolvedValueOnce(staleCore())
        .mockResolvedValueOnce(targetCore()),
    });

    const result = await runCoreIpcRepair(
      { apply: true, expectedReleaseId: "release-123" },
      deps,
      targetCore(),
      vi.fn(),
    );

    expect(result.status).toBe("applied");
    expect(deps.compareAndSwap).toHaveBeenCalledOnce();
  });

  it("accepts an ambiguous zero-row result only when readback is correct", async () => {
    const deps = dependencies({
      compareAndSwap: vi.fn(async () => false),
      readCore: vi
        .fn<CoreIpcRepairDependencies["readCore"]>()
        .mockResolvedValueOnce(staleCore())
        .mockResolvedValueOnce(targetCore()),
    });

    const result = await runCoreIpcRepair(
      { apply: true, expectedReleaseId: "release-123" },
      deps,
      targetCore(),
      vi.fn(),
    );

    expect(result.status).toBe("verified");
  });

  it("fails before writing if the active release changes", async () => {
    const deps = dependencies({
      readActiveRelease: vi
        .fn<CoreIpcRepairDependencies["readActiveRelease"]>()
        .mockResolvedValueOnce({
          id: "release-123",
          shanghaiSnapshotId: "recovery-fallback",
        })
        .mockResolvedValueOnce({
          id: "release-new",
          shanghaiSnapshotId: "new-snapshot",
        }),
    });

    await expect(
      runCoreIpcRepair(
        { apply: true, expectedReleaseId: "release-123" },
        deps,
        targetCore(),
        vi.fn(),
      ),
    ).rejects.toThrow(/active release changed/i);
    expect(deps.compareAndSwap).not.toHaveBeenCalled();
  });
});
