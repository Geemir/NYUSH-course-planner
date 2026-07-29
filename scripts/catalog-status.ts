/**
 * Prints the active catalog release and per-source course counts — a quick
 * health check / verification for the local database.
 *
 *   npx tsx --conditions=react-server scripts/catalog-status.ts
 *
 * Exit codes: 0 = an active release exists, 3 = none (needs seeding/sync).
 */
import { assertDatabaseUnlocked } from "./lib/preflight-db-lock";
import { withDbRetry } from "./lib/db-retry";

async function main(): Promise<number> {
  await assertDatabaseUnlocked();
  const { db } = await import("@/db");
  const { readCatalogBootstrap, CatalogUnavailableError } = await import(
    "@/lib/catalog/searchRepository"
  );

  try {
    const bootstrap = await withDbRetry(() => readCatalogBootstrap(db), {
      label: "catalog status read",
    });
    const total = bootstrap.sources.reduce((sum, source) => sum + source.courseCount, 0);
    console.log(`active release: ${bootstrap.release.id}`);
    console.log(`sources: ${bootstrap.sources.length} | total courses: ${total}`);
    for (const source of bootstrap.sources) {
      const campus = source.campus === "new-york" ? "NY" : "SH";
      console.log(
        `  ${campus} ${source.schoolName.padEnd(48)} ${String(source.courseCount).padStart(5)}  ${source.status}`,
      );
    }
    return 0;
  } catch (error) {
    if (error instanceof CatalogUnavailableError) {
      console.log("No active catalog release — run `npm run db:seed` (and fill-ny-catalog).");
      return 3;
    }
    throw error;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
