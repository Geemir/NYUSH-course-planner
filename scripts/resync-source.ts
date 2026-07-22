/**
 * Re-syncs ONE catalog source from the live Bulletin and recomposes the active
 * release, leaving every other source's snapshot untouched. Use after a parser
 * change to refresh a single school (e.g. NYUSH) without re-fetching the rest:
 *
 *   npx tsx --conditions=react-server scripts/resync-source.ts nyu-shanghai
 *
 * Stop the dev server first — PGlite is single-process. Clears stale sync-lock
 * rows left by any earlier crashed run before starting.
 */
import { sql } from "drizzle-orm";
import { createBulletinFetch } from "@/lib/bulletin/fetch";
import { getCatalogSource } from "@/lib/bulletin/sourceRegistry";
import { syncCatalogSources } from "@/lib/bulletin/syncAll";
import { assertDatabaseUnlocked } from "./lib/preflight-db-lock";

async function main() {
  const sourceId = process.argv[2];
  if (!sourceId) throw new Error("Usage: resync-source.ts <sourceId>");
  getCatalogSource(sourceId); // validates the id

  await assertDatabaseUnlocked();
  const { db } = await import("@/db");
  await db.execute(
    sql`delete from "catalogSnapshot" where id like '\_\_bulletin\_sync\_lock\_\_%' escape '\'`,
  );
  const fetcher = createBulletinFetch({
    timeoutMs: 30_000,
    retries: 2,
    userAgent: "NYUSH Course Planner Bulletin Synchronizer",
  });
  const result = await syncCatalogSources({ sourceIds: [sourceId], fetchPage: fetcher, db });
  for (const source of result.sourceResults) {
    console.log(
      `${source.status.padEnd(9)} ${source.sourceId}` +
        (source.diagnostics.length ? `  [${source.diagnostics.join(", ")}]` : ""),
    );
  }
  console.log(`release=${result.releaseId ?? "none"} complete=${result.complete}`);
  if (!result.complete) {
    console.log("No release composed — some enabled source lacks an active snapshot.");
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
