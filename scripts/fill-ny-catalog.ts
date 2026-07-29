/**
 * Fills the catalog with the enabled New York school inventories WITHOUT
 * re-syncing NYU Shanghai: the existing active nyu-shanghai snapshot (e.g. the
 * seeded recovery catalog) is reused as-is, and a composed release activates
 * once every enabled source has an active snapshot. (Dentistry and Professional
 * Studies are disabled in sourceRegistry.ts — no undergraduate inventory.)
 *
 *   npx tsx --conditions=react-server scripts/fill-ny-catalog.ts
 *   npx tsx --conditions=react-server scripts/fill-ny-catalog.ts --missing-only
 *   $env:DATABASE_URL="postgres://…"; npx tsx … fill-ny-catalog.ts   # target prod
 *
 * Retries internally (up to 4 passes): a large first source occasionally
 * destabilizes the rest of a single-process batch, so each pass re-targets only
 * the sources still missing an active snapshot until a full release composes.
 * `--missing-only` skips the initial full-refresh pass. Exits 0 when complete.
 * Stale sync-lock rows are cleared automatically. Set DATABASE_URL to fill a
 * hosted Postgres (e.g. the Vercel deployment); otherwise it targets local
 * PGlite — stop the dev server first in that case.
 */
import { sql } from "drizzle-orm";
import { createBulletinFetch } from "@/lib/bulletin/fetch";
import { CATALOG_SOURCES } from "@/lib/bulletin/sourceRegistry";
import { getCatalogSourceStatuses } from "@/lib/catalogRepository";
import { syncCatalogSources } from "@/lib/bulletin/syncAll";
import { assertDatabaseUnlocked } from "./lib/preflight-db-lock";

const MAX_ATTEMPTS = 4;

async function main(): Promise<number> {
  await assertDatabaseUnlocked();
  const { db } = await import("@/db");

  const enabledNy = CATALOG_SOURCES.filter(
    (source) => source.enabled && source.id !== "nyu-shanghai",
  ).map((source) => source.id);
  const forceAll = !process.argv.includes("--missing-only");

  const fetcher = createBulletinFetch({
    timeoutMs: 30_000,
    retries: 2,
    userAgent: "NYUSH Course Planner Bulletin Synchronizer",
  });

  // Retries within one run: a big first source (arts-science, ~2,900 courses)
  // sometimes destabilizes the rest of a single-process batch, so after the
  // first pass we re-target only the sources still missing an active snapshot
  // (arts-science is skipped once it succeeds) until a full release composes.
  let lastComplete = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !lastComplete; attempt += 1) {
    // Clear stale sync locks a crashed/failed pass may have left behind.
    await db.execute(
      sql`delete from "catalogSnapshot" where id like '\_\_bulletin\_sync\_lock\_\_%' escape '\'`,
    );

    const statuses = await getCatalogSourceStatuses(db);
    const active = new Map(statuses.map((status) => [status.sourceId, status.activeSnapshotId]));
    const missing = enabledNy.filter((id) => !active.get(id));
    // First pass may force a full refresh; later passes only chase what's missing.
    const targets = attempt === 1 && forceAll ? enabledNy : missing;

    if (targets.length === 0 && missing.length === 0) {
      // Everything is synced — just (re)compose the release from active snapshots.
      const result = await syncCatalogSources({ sourceIds: [], fetchPage: fetcher, db });
      console.log(`release=${result.releaseId ?? "none"} complete=${result.complete}`);
      return result.complete ? 0 : 1;
    }

    console.log(
      `\n── attempt ${attempt}/${MAX_ATTEMPTS}: syncing ${targets.length} New York source(s) ──`,
    );
    const started = Date.now();
    const result = await syncCatalogSources({ sourceIds: targets, fetchPage: fetcher, db });
    console.log(`(${((Date.now() - started) / 1000).toFixed(0)}s)`);
    for (const source of result.sourceResults) {
      console.log(
        `  ${source.status.padEnd(9)} ${source.sourceId}` +
          (source.diagnostics.length ? `  [${source.diagnostics.join(", ")}]` : ""),
      );
    }
    console.log(`  release=${result.releaseId ?? "none"} complete=${result.complete}`);
    lastComplete = result.complete;
  }

  if (!lastComplete) {
    console.log(
      `\nStill incomplete after ${MAX_ATTEMPTS} attempts — some enabled source keeps failing.` +
        "\nRun it once more, or check per-source diagnostics above; disable a genuinely" +
        "\ngraduate-only source in sourceRegistry.ts (enabled:false) if it has no undergrad courses.",
    );
  } else {
    console.log("\n✓ Full catalog release composed.");
  }
  return lastComplete ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
