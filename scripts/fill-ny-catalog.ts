/**
 * Fills the catalog with the enabled New York school inventories WITHOUT
 * re-syncing NYU Shanghai: the existing active nyu-shanghai snapshot (e.g. the
 * seeded recovery catalog) is reused as-is, and a composed release activates
 * once every enabled source has an active snapshot. (Dentistry and Professional
 * Studies are disabled in sourceRegistry.ts — no undergraduate inventory.)
 *
 *   npx tsx --conditions=react-server scripts/fill-ny-catalog.ts
 *
 * Prints per-source outcomes and real diagnostics (the npm CLI swallows them).
 * Stop the dev server first when running against local PGlite.
 */
import { createBulletinFetch } from "@/lib/bulletin/fetch";
import { CATALOG_SOURCES } from "@/lib/bulletin/sourceRegistry";
import { syncCatalogSources } from "@/lib/bulletin/syncAll";
import { assertDatabaseUnlocked } from "./lib/preflight-db-lock";

async function main() {
  await assertDatabaseUnlocked();
  const { db } = await import("@/db");
  const nySourceIds = CATALOG_SOURCES.filter(
    (source) => source.enabled && source.id !== "nyu-shanghai",
  ).map((source) => source.id);
  console.log(`Syncing ${nySourceIds.length} New York sources (NYUSH snapshot reused as-is)…`);

  const fetcher = createBulletinFetch({
    timeoutMs: 30_000,
    retries: 2,
    userAgent: "NYUSH Course Planner Bulletin Synchronizer",
  });
  const started = Date.now();
  const result = await syncCatalogSources({ sourceIds: nySourceIds, fetchPage: fetcher, db });

  console.log(`\n=== ${((Date.now() - started) / 1000).toFixed(0)}s ===`);
  for (const source of result.sourceResults) {
    console.log(
      `${source.status.padEnd(9)} ${source.sourceId}` +
        (source.diagnostics.length ? `  [${source.diagnostics.join(", ")}]` : "") +
        (source.snapshotId ? `  snapshot=${source.snapshotId}` : ""),
    );
  }
  console.log(`\nrelease=${result.releaseId ?? "none"} complete=${result.complete}`);
  if (result.publicationDiagnostics?.length) {
    console.log("publication diagnostics:", result.publicationDiagnostics.join(", "));
  }
  if (!result.complete) {
    console.log(
      "\nNo release composed — every enabled source needs an active snapshot." +
        "\nFix or disable (sourceRegistry.ts enabled:false) the failed sources above and re-run.",
    );
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
