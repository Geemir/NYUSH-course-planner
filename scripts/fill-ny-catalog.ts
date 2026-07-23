/**
 * Fills the catalog with the enabled New York school inventories WITHOUT
 * re-syncing NYU Shanghai: the existing active nyu-shanghai snapshot (e.g. the
 * seeded recovery catalog) is reused as-is, and a composed release activates
 * once every enabled source has an active snapshot. (Dentistry and Professional
 * Studies are disabled in sourceRegistry.ts — no undergraduate inventory.)
 *
 *   npx tsx --conditions=react-server scripts/fill-ny-catalog.ts
 *   npx tsx --conditions=react-server scripts/fill-ny-catalog.ts --missing-only
 *
 * `--missing-only` syncs just the enabled NY sources that lack an active
 * snapshot — idempotent and retry-friendly (a large first source occasionally
 * destabilizes the rest of a single-process batch; re-running in a fresh process
 * picks up where it left off). Exits 0 when a full release is composed, 1
 * otherwise, so a caller can loop. Stale sync-lock rows from a crashed run are
 * cleared automatically. Stop the dev server first when using local PGlite.
 */
import { sql } from "drizzle-orm";
import { createBulletinFetch } from "@/lib/bulletin/fetch";
import { CATALOG_SOURCES } from "@/lib/bulletin/sourceRegistry";
import { getCatalogSourceStatuses } from "@/lib/catalogRepository";
import { syncCatalogSources } from "@/lib/bulletin/syncAll";
import { assertDatabaseUnlocked } from "./lib/preflight-db-lock";

async function main(): Promise<number> {
  await assertDatabaseUnlocked();
  const { db } = await import("@/db");

  // Clear stale sync locks left by any crashed run (they block every source).
  await db.execute(
    sql`delete from "catalogSnapshot" where id like '\_\_bulletin\_sync\_lock\_\_%' escape '\'`,
  );

  const enabledNy = CATALOG_SOURCES.filter(
    (source) => source.enabled && source.id !== "nyu-shanghai",
  ).map((source) => source.id);

  let targets = enabledNy;
  if (process.argv.includes("--missing-only")) {
    const statuses = await getCatalogSourceStatuses(db);
    const active = new Map(statuses.map((status) => [status.sourceId, status.activeSnapshotId]));
    targets = enabledNy.filter((id) => !active.get(id));
    if (targets.length === 0) {
      console.log("All enabled New York sources already have active snapshots.");
    }
  }

  console.log(`Syncing ${targets.length} New York source(s) (NYUSH snapshot reused as-is)…`);
  const fetcher = createBulletinFetch({
    timeoutMs: 30_000,
    retries: 2,
    userAgent: "NYUSH Course Planner Bulletin Synchronizer",
  });
  const started = Date.now();
  const result = await syncCatalogSources({ sourceIds: targets, fetchPage: fetcher, db });

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
      "\nNo full release yet — some enabled source lacks an active snapshot." +
        "\nRe-run with --missing-only to retry just those, or disable a genuinely" +
        "\ngraduate-only source (sourceRegistry.ts enabled:false).",
    );
  }
  return result.complete ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
