import { and, asc, eq, inArray, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { CATALOG_SOURCES } from "../src/lib/bulletin/sourceRegistry";
import type { CatalogDb } from "../src/lib/catalogRepository";

export interface SourceVerificationRow {
  sourceId: string;
  snapshotId: string;
  status: "healthy" | "retained" | "failed";
  documentCount: number;
  courseCount: number;
  quarantinedCount: number;
  sourceHash: string;
  diagnosticCodes: string[];
}

export interface SourceVerificationReport {
  ok: boolean;
  activeReleaseId: string | null;
  overlayConflictCount: number;
  rows: SourceVerificationRow[];
  errors: string[];
}

export function evaluateSourceVerification(
  rows: SourceVerificationRow[],
  options: { activeReleaseId: string | null; expectedSourceIds?: string[]; shanghaiProgramCount: number; newYorkProgramCount: number; nonUndergraduateCount: number; overlayConflictCount?: number },
): SourceVerificationReport {
  const expected = [...(options.expectedSourceIds ?? CATALOG_SOURCES.map((source) => source.id))].sort();
  const actual = rows.map((row) => row.sourceId).sort();
  const errors: string[] = [];
  if (!options.activeReleaseId) errors.push("No active catalog release.");
  if (expected.length !== 14 || JSON.stringify(actual) !== JSON.stringify(expected)) errors.push("Active release must contain exactly Shanghai plus 13 New York sources.");
  rows.filter((row) => row.status === "failed").forEach((row) => errors.push(`${row.sourceId} has no healthy or retained snapshot.`));
  rows.filter((row) => row.courseCount === 0).forEach((row) => errors.push(`${row.sourceId} has zero published courses.`));
  if (options.shanghaiProgramCount === 0) errors.push("Shanghai has zero executable programs.");
  if (options.newYorkProgramCount !== 0) errors.push("New York sources contain executable programs.");
  if (options.nonUndergraduateCount !== 0) errors.push("Graduate or ambiguous records are present in the active release.");
  if ((options.overlayConflictCount ?? 0) !== 0) errors.push("Active catalog has unresolved overlay conflicts.");
  return { ok: errors.length === 0, activeReleaseId: options.activeReleaseId, overlayConflictCount: options.overlayConflictCount ?? 0, rows, errors };
}

function diagnosticCodes(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const report = value as { errors?: Array<{ code?: unknown }>; warnings?: Array<{ code?: unknown }> };
  return [...(report.errors ?? []), ...(report.warnings ?? [])].flatMap((item) => typeof item.code === "string" ? [item.code] : []);
}

export async function collectSourceVerification(database: CatalogDb): Promise<SourceVerificationReport> {
  const [release] = await database.select().from(schema.catalogRelease).where(eq(schema.catalogRelease.status, "active")).limit(1);
  if (!release) return evaluateSourceVerification([], { activeReleaseId: null, shanghaiProgramCount: 0, newYorkProgramCount: 0, nonUndergraduateCount: 0 });
  const memberships = await database.select().from(schema.catalogReleaseSource).where(eq(schema.catalogReleaseSource.releaseId, release.id)).orderBy(asc(schema.catalogReleaseSource.sourceId));
  const snapshotIds = memberships.map((row) => row.snapshotId);
  const snapshots = snapshotIds.length ? await database.select().from(schema.catalogSnapshot).where(inArray(schema.catalogSnapshot.id, snapshotIds)) : [];
  const bySnapshot = new Map(snapshots.map((row) => [row.id, row]));
  const failedSources = new Set((await database.select({ sourceId: schema.catalogSnapshot.sourceId }).from(schema.catalogSnapshot).where(eq(schema.catalogSnapshot.status, "failed"))).map((row) => row.sourceId));
  const rows = memberships.map((membership): SourceVerificationRow => {
    const snapshot = bySnapshot.get(membership.snapshotId);
    if (!snapshot) return { sourceId: membership.sourceId, snapshotId: membership.snapshotId, status: "failed", documentCount: 0, courseCount: 0, quarantinedCount: 0, sourceHash: "", diagnosticCodes: ["missing-snapshot"] };
    return { sourceId: membership.sourceId, snapshotId: snapshot.id, status: failedSources.has(membership.sourceId) ? "retained" : "healthy", documentCount: snapshot.documentCount, courseCount: snapshot.courseCount, quarantinedCount: snapshot.quarantinedCount, sourceHash: snapshot.sourceHash, diagnosticCodes: diagnosticCodes(snapshot.validationReport) };
  });
  const [[shanghaiPrograms], [newYorkPrograms], [nonUndergraduate]] = await Promise.all([
    database.select({ count: sql<number>`count(*)::int` }).from(schema.catalogProgram).where(eq(schema.catalogProgram.snapshotId, release.sourceSnapshotIds["nyu-shanghai"] ?? "")),
    database.select({ count: sql<number>`count(*)::int` }).from(schema.catalogProgram).where(and(inArray(schema.catalogProgram.snapshotId, snapshotIds.filter((id) => id !== release.sourceSnapshotIds["nyu-shanghai"])))),
    database.select({ count: sql<number>`count(*)::int` }).from(schema.catalogCourse).where(and(inArray(schema.catalogCourse.snapshotId, snapshotIds), inArray(schema.catalogCourse.level, ["graduate", "ambiguous"]))),
  ]);
  return evaluateSourceVerification(rows, { activeReleaseId: release.id, shanghaiProgramCount: shanghaiPrograms.count, newYorkProgramCount: newYorkPrograms.count, nonUndergraduateCount: nonUndergraduate.count });
}

async function main() {
  const { db } = await import("../src/db");
  const report = await collectSourceVerification(db);
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.table(report.rows);
    console.log(`Active release: ${report.activeReleaseId ?? "none"}`);
    report.errors.forEach((error) => console.error(`ERROR: ${error}`));
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("verify-v0-2-sources.ts")) {
  void main()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((error) => { console.error(error); process.exit(1); });
}
