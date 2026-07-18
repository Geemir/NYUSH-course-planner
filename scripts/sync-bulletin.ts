import { basename } from "node:path";
import type { SyncResult } from "@/lib/bulletin/sync";
import type { CatalogSyncResult } from "@/lib/bulletin/syncAll";
import { getCatalogSource } from "@/lib/bulletin/sourceRegistry";

interface BulletinSyncCliOptions {
  execute: () => Promise<SyncResult | CatalogSyncResult>;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

export async function runBulletinSyncCli({
  execute,
  stdout,
  stderr,
}: BulletinSyncCliOptions): Promise<0 | 1> {
  try {
    const result = await execute();
    if ("sourceResults" in result) {
      result.sourceResults.forEach((source) =>
        stdout(
          `${source.sourceId}: ${source.status} snapshot=${source.snapshotId ?? source.retainedSnapshotId ?? "none"}`,
        ),
      );
      stdout(`release=${result.releaseId ?? "none"} complete=${result.complete}`);
    } else {
      stdout(
        `${result.outcome}: snapshot=${result.snapshotId} documents=${result.documentCount} courses=${result.courseCount} programs=${result.programCount}`,
      );
    }
    return 0;
  } catch {
    stderr("Bulletin synchronization failed.");
    return 1;
  }
}

export function sourceIdsFromArgs(argv: string[]): string[] | undefined {
  const values = argv
    .filter((argument) => argument.startsWith("--source="))
    .map((argument) => argument.slice("--source=".length));
  if (values.length === 0) return undefined;
  const unique = [...new Set(values)];
  unique.forEach((sourceId) => {
    const source = getCatalogSource(sourceId);
    if (!source.enabled) throw new Error(`Disabled catalog source: ${sourceId}`);
  });
  return unique;
}

async function executeDefault(): Promise<CatalogSyncResult> {
  // These imports must stay inside runBulletinSyncCli's safe try boundary.
  // The Node command activates Next's react-server export condition so the
  // server-only marker resolves to its permitted empty module.
  const [{ db }, { createBulletinFetch }, { syncCatalogSources }] = await Promise.all([
    import("@/db"),
    import("@/lib/bulletin/fetch"),
    import("@/lib/bulletin/syncAll"),
  ]);
  const sourceIds = sourceIdsFromArgs(process.argv.slice(2));
  if (process.argv.includes("--startup-smoke")) {
    throw new Error("Intentional no-network startup smoke failure.");
  }
  const fetcher = createBulletinFetch({
    timeoutMs: 15_000,
    retries: 2,
    userAgent: "NYUSH Course Planner Bulletin Synchronizer",
  });
  return syncCatalogSources({ sourceIds, fetchPage: fetcher, db });
}

async function main(): Promise<0 | 1> {
  return runBulletinSyncCli({
    execute: executeDefault,
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  });
}

if (basename(process.argv[1] ?? "") === "sync-bulletin.ts") {
  void main().then((exitCode) => {
    process.exit(exitCode);
  });
}
