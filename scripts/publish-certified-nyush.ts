import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { SourceCatalogCandidate } from "@/lib/catalog/types";
import type { SnapshotValidationReport } from "@/lib/bulletin/validateSnapshot";
import { assertPublishable } from "@/lib/bulletin/validateSnapshot";
import type { CertificationArtifact } from "./certify-nyush-programs";

export function requirePublishableReport(report: CertificationArtifact, candidate: Pick<SourceCatalogCandidate, "sourceHash" | "snapshotId">): void {
  if (report.status !== "pass" || report.programCount !== 43 || report.failed !== 0) throw new Error("Certification report is incomplete or failed.");
  if (report.candidateHash !== candidate.sourceHash || report.candidateSnapshotId !== candidate.snapshotId) throw new Error("Certification report hash does not match the candidate.");
}

export function requireStableActiveRelease(expected: string | null, current: string | null): void {
  if (!expected || expected !== current) throw new Error("The active release changed after certification dry run.");
}

export function resultingReleaseId(sourceSnapshotIds: Record<string, string>): string {
  const canonical = Object.entries(sourceSnapshotIds).sort(([left], [right]) => left.localeCompare(right));
  return `release-${createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 24)}`;
}

export function parsePublishArgs(args: readonly string[]) {
  const report = args.find((arg) => arg.startsWith("--report="))?.slice("--report=".length) ?? "artifacts/nyush-certification-report.json";
  return { report, apply: args.includes("--apply"), help: args.includes("--help") };
}

function sourceArtifact(value: unknown): { candidate: SourceCatalogCandidate; validationReport: SnapshotValidationReport } {
  if (!value || typeof value !== "object" || !("candidate" in value) || !("validationReport" in value)) throw new Error("Publication requires a generated source candidate artifact.");
  return value as { candidate: SourceCatalogCandidate; validationReport: SnapshotValidationReport };
}

export async function runPublishCli(args = process.argv.slice(2)): Promise<number> {
  const options = parsePublishArgs(args);
  if (options.help) { process.stdout.write("Usage: catalog:publish-certified-nyush -- --report=<report-json> [--apply]\n"); return 0; }
  const reportPath = resolve(options.report);
  const report = JSON.parse(await readFile(reportPath, "utf8")) as CertificationArtifact;
  const artifact = sourceArtifact(JSON.parse(await readFile(report.candidatePath, "utf8")));
  requirePublishableReport(report, artifact.candidate);
  assertPublishable(artifact.validationReport);
  if (artifact.candidate.sourceId !== "nyu-shanghai") throw new Error("Only the certified NYU Shanghai source may be published by this command.");
  const [{ db }, repository] = await Promise.all([import("@/db"), import("@/lib/catalogRepository")]);
  const active = await repository.getActiveCatalogRelease(db);
  if (!active) throw new Error("No active source-complete catalog release exists.");
  const memberships = { ...active.sourceSnapshotIds, "nyu-shanghai": artifact.candidate.snapshotId };
  if (!options.apply) {
    report.expectedActiveReleaseId = active.id;
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`DRY RUN\ncurrent=${active.id}\ncandidate=${artifact.candidate.snapshotId}\nresult=${resultingReleaseId(memberships)}\nmemberships=${JSON.stringify(memberships)}\n`);
    return 0;
  }
  requireStableActiveRelease(report.expectedActiveReleaseId, active.id);
  const publication = await repository.publishSourceCandidate(db, artifact.candidate, artifact.validationReport);
  const next = await repository.composeCatalogRelease(db, memberships);
  process.stdout.write(`Activated ${next.id}; previous release ${active.id}; Shanghai ${publication.snapshotId}.\n`);
  return 0;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) void runPublishCli().then((code) => process.exit(code)).catch((error) => { console.error(error); process.exit(1); });
