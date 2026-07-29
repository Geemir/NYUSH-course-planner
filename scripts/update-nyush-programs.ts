/**
 * Updates the NYU Shanghai program requirement definitions in the ACTIVE
 * catalog release from `src/data/catalog-fallback.json`, in place — without
 * touching any courses or the New York study-away catalog. Use this to push a
 * hand-edited requirement fix (e.g. Core Curriculum choose-N pools) to a
 * database that already has a full release, avoiding a destructive re-seed +
 * re-fill.
 *
 *   $env:DATABASE_URL="postgres://…"   # target prod; omit for local PGlite
 *   npx tsx --conditions=react-server scripts/update-nyush-programs.ts
 *
 * Only rewrites `catalogProgram.data` rows for the release's nyu-shanghai
 * snapshot, so the active release, courses, and NY sources are unaffected.
 */
import { and, eq } from "drizzle-orm";
import fallback from "@/data/catalog-fallback.json";
import * as schema from "@/db/schema";
import { getActiveCatalogRelease } from "@/lib/catalogRepository";
import { CatalogProgramSchema } from "@/lib/types";
import { assertDatabaseUnlocked } from "./lib/preflight-db-lock";
import { withDbRetry } from "./lib/db-retry";

async function main(): Promise<void> {
  await assertDatabaseUnlocked();
  const { db } = await import("@/db");

  const release = await withDbRetry(() => getActiveCatalogRelease(db), { label: "read active release" });
  if (!release) throw new Error("No active catalog release — seed/fill the catalog first.");
  const snapshotId = release.sourceSnapshotIds["nyu-shanghai"];
  if (!snapshotId) throw new Error("The active release has no nyu-shanghai snapshot.");

  const existingRows = await withDbRetry(
    () =>
      db
        .select({ programId: schema.catalogProgram.programId })
        .from(schema.catalogProgram)
        .where(eq(schema.catalogProgram.snapshotId, snapshotId)),
    { label: "read program ids" },
  );
  const existing = new Set(existingRows.map((row) => row.programId));

  const programs = fallback.programs.map((program) => CatalogProgramSchema.parse(program));
  const present = programs.filter((program) => existing.has(program.id));
  const missing = programs.filter((program) => !existing.has(program.id)).map((p) => p.id);

  // Update each program in its own retried statement (autocommit). One row is a
  // small write, so a dropped connection just retries that row rather than
  // losing a whole 43-statement transaction over a flaky remote link.
  for (const program of present) {
    await withDbRetry(
      async () => {
        await db
          .update(schema.catalogProgram)
          .set({ data: program })
          .where(
            and(
              eq(schema.catalogProgram.snapshotId, snapshotId),
              eq(schema.catalogProgram.programId, program.id),
            ),
          );
      },
      { label: `update ${program.id}` },
    );
  }
  const updated = present.length;

  console.log(
    `Updated ${updated}/${programs.length} NYUSH program definitions in snapshot ${snapshotId}.`,
  );
  if (missing.length > 0) {
    console.log(`Not present in this snapshot (skipped): ${missing.join(", ")}`);
  }
  console.log("Courses and the New York catalog were not touched.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
