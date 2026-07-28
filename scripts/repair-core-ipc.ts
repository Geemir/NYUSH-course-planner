import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import fallback from "@/data/catalog-fallback.json";
import {
  assertCoreIpcTarget,
  planCoreIpcRepair,
  type CoreIpcSummary,
} from "@/lib/catalog/coreIpcRepair";
import {
  CatalogProgramSchema,
  type CatalogProgram,
} from "@/lib/types";

export type CoreIpcRepairOptions = {
  apply: boolean;
  expectedReleaseId: string | null;
};

export type ActiveCatalogIdentity = {
  id: string;
  shanghaiSnapshotId: string;
};

export type CoreIpcRepairDependencies = {
  readActiveRelease: () => Promise<ActiveCatalogIdentity | null>;
  readCore: (snapshotId: string) => Promise<CatalogProgram | null>;
  compareAndSwap: (input: {
    snapshotId: string;
    current: CatalogProgram;
    candidate: CatalogProgram;
  }) => Promise<boolean>;
};

export type CoreIpcRepairResult = {
  status: "dry-run" | "already-correct" | "applied" | "verified";
  releaseId: string;
  snapshotId: string;
};

export function parseRepairArgs(args: string[]): CoreIpcRepairOptions {
  let apply = false;
  let expectedReleaseId: string | null = null;
  for (const argument of args) {
    if (argument === "--apply") {
      apply = true;
      continue;
    }
    if (argument.startsWith("--expected-release=")) {
      expectedReleaseId = argument.slice("--expected-release=".length).trim();
      if (!expectedReleaseId) {
        throw new Error("--expected-release requires a non-empty release ID.");
      }
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }
  if (apply && !expectedReleaseId) {
    throw new Error("--apply requires --expected-release=<release-id>.");
  }
  return { apply, expectedReleaseId };
}

function formatSummary(summary: CoreIpcSummary[]): string {
  return summary
    .map(
      ({ id, kind, count, childCount }) =>
        `${id}: ${kind}${count === null ? "" : ` ${count}`} of ${childCount}`,
    )
    .join(" | ");
}

async function requireStableRelease(
  dependencies: CoreIpcRepairDependencies,
  expected: ActiveCatalogIdentity,
): Promise<void> {
  const active = await dependencies.readActiveRelease();
  if (
    !active ||
    active.id !== expected.id ||
    active.shanghaiSnapshotId !== expected.shanghaiSnapshotId
  ) {
    throw new Error(
      `Active release changed during repair; expected ${expected.id}/${expected.shanghaiSnapshotId}.`,
    );
  }
}

export async function runCoreIpcRepair(
  options: CoreIpcRepairOptions,
  dependencies: CoreIpcRepairDependencies,
  target: CatalogProgram,
  log: (message: string) => void = console.log,
): Promise<CoreIpcRepairResult> {
  const release = await dependencies.readActiveRelease();
  if (!release) throw new Error("No active catalog release is available.");
  if (
    options.expectedReleaseId &&
    options.expectedReleaseId !== release.id
  ) {
    throw new Error(
      `Expected release ${options.expectedReleaseId}, but ${release.id} is active.`,
    );
  }

  const current = await dependencies.readCore(release.shanghaiSnapshotId);
  if (!current) {
    throw new Error(
      `Core program is missing from Shanghai snapshot ${release.shanghaiSnapshotId}.`,
    );
  }
  const repair = planCoreIpcRepair(current, target);
  log(`release: ${release.id}`);
  log(`Shanghai snapshot: ${release.shanghaiSnapshotId}`);
  log(`before: ${formatSummary(repair.before)}`);
  log(`after: ${formatSummary(repair.after)}`);

  if (!options.apply) {
    log("DRY RUN: no database changes");
    return {
      status: "dry-run",
      releaseId: release.id,
      snapshotId: release.shanghaiSnapshotId,
    };
  }

  await requireStableRelease(dependencies, release);
  if (!repair.changed) {
    log("ALREADY CORRECT: no database changes");
    return {
      status: "already-correct",
      releaseId: release.id,
      snapshotId: release.shanghaiSnapshotId,
    };
  }

  const updated = await dependencies.compareAndSwap({
    snapshotId: release.shanghaiSnapshotId,
    current,
    candidate: repair.candidate,
  });
  const readback = await dependencies.readCore(release.shanghaiSnapshotId);
  if (!readback) throw new Error("Core program disappeared during repair.");
  assertCoreIpcTarget(readback);
  await requireStableRelease(dependencies, release);

  const status = updated ? "applied" : "verified";
  log(updated ? "APPLIED AND VERIFIED" : "ALREADY APPLIED AND VERIFIED");
  return {
    status,
    releaseId: release.id,
    snapshotId: release.shanghaiSnapshotId,
  };
}

async function withReadRetry<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, attempt * 500),
        );
      }
    }
  }
  throw new Error(`${label} failed after 3 attempts.`, { cause: lastError });
}

async function productionDependencies(): Promise<CoreIpcRepairDependencies> {
  const [{ and, eq, sql }, schema, { db }, repository] = await Promise.all([
    import("drizzle-orm"),
    import("@/db/schema"),
    import("@/db"),
    import("@/lib/catalogRepository"),
  ]);

  return {
    readActiveRelease: () =>
      withReadRetry("Read active release", async () => {
        const release = await repository.getActiveCatalogRelease(db);
        if (!release) return null;
        const shanghaiSnapshotId = release.sourceSnapshotIds["nyu-shanghai"];
        if (!shanghaiSnapshotId) {
          throw new Error("Active release has no nyu-shanghai snapshot.");
        }
        return { id: release.id, shanghaiSnapshotId };
      }),
    readCore: (snapshotId) =>
      withReadRetry("Read Core program", async () => {
        const [row] = await db
          .select({ data: schema.catalogProgram.data })
          .from(schema.catalogProgram)
          .where(
            and(
              eq(schema.catalogProgram.snapshotId, snapshotId),
              eq(schema.catalogProgram.programId, "core"),
            ),
          )
          .limit(1);
        return row ? CatalogProgramSchema.parse(row.data) : null;
      }),
    compareAndSwap: async ({ snapshotId, current, candidate }) => {
      const updated = await db
        .update(schema.catalogProgram)
        .set({ data: candidate })
        .where(
          and(
            eq(schema.catalogProgram.snapshotId, snapshotId),
            eq(schema.catalogProgram.programId, "core"),
            sql`${schema.catalogProgram.data} = ${JSON.stringify(current)}::jsonb`,
          ),
        )
        .returning();
      return updated.length === 1;
    },
  };
}

async function main(): Promise<void> {
  const { assertDatabaseUnlocked } = await import("./lib/preflight-db-lock");
  await assertDatabaseUnlocked();
  const targetInput = fallback.programs.find((program) => program.id === "core");
  if (!targetInput) throw new Error("Checked-in fallback has no Core program.");
  await runCoreIpcRepair(
    parseRepairArgs(process.argv.slice(2)),
    await productionDependencies(),
    CatalogProgramSchema.parse(targetInput),
  );
}

const isMain =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(
        error instanceof Error ? error.message : "Core IPC repair failed.",
      );
      process.exit(1);
    });
}
