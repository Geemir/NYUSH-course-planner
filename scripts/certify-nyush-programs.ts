import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { certifyShanghaiPrograms, type ProgramGoldenExpectation } from "@/lib/bulletin/certifyPrograms";
import { CatalogProgramSchema, type CatalogProgram } from "@/lib/types";

export interface CertificationArtifact {
  status: "pass" | "fail";
  programCount: number;
  passed: number;
  failed: number;
  programs: ReturnType<typeof certifyShanghaiPrograms>["programs"];
  candidateHash: string;
  candidateSnapshotId: string;
  candidatePath: string;
  expectedActiveReleaseId: string | null;
  createdAt: string;
}

export function evaluateCertification(golden: readonly ProgramGoldenExpectation[], programs: readonly CatalogProgram[]) {
  return certifyShanghaiPrograms(programs, golden);
}

export function parseCertificationArgs(args: readonly string[]) {
  const value = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  return { candidate: value("candidate") ?? "src/data/catalog-fallback.json", output: value("output") ?? "artifacts/nyush-certification-report.json", help: args.includes("--help") };
}

function candidateShape(value: unknown): { programs: CatalogProgram[]; hash: string; snapshotId: string } {
  if (!value || typeof value !== "object") throw new Error("Invalid candidate artifact.");
  const root = value as Record<string, unknown>;
  const source = (root.candidate && typeof root.candidate === "object" ? root.candidate : root) as Record<string, unknown>;
  const snapshot = root.snapshot && typeof root.snapshot === "object" ? root.snapshot as Record<string, unknown> : null;
  return {
    programs: CatalogProgramSchema.array().parse(source.programs),
    hash: String(source.sourceHash ?? snapshot?.sourceHash ?? ""),
    snapshotId: String(source.snapshotId ?? snapshot?.id ?? ""),
  };
}

export async function runCertificationCli(args = process.argv.slice(2)): Promise<number> {
  const options = parseCertificationArgs(args);
  if (options.help) { process.stdout.write("Usage: catalog:certify-nyush -- [--candidate=<json>] [--output=<report-json>]\n"); return 0; }
  const [candidateJson, goldenJson] = await Promise.all([readFile(resolve(options.candidate), "utf8"), readFile(resolve("src/data/nyush-program-golden.json"), "utf8")]);
  const candidate = candidateShape(JSON.parse(candidateJson));
  const golden = JSON.parse(goldenJson) as ProgramGoldenExpectation[];
  const result = evaluateCertification(golden, candidate.programs);
  const artifact: CertificationArtifact = { ...result, candidateHash: candidate.hash, candidateSnapshotId: candidate.snapshotId, candidatePath: resolve(options.candidate), expectedActiveReleaseId: null, createdAt: new Date().toISOString() };
  const output = resolve(options.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`${result.passed}/${result.programCount} NYU Shanghai programs certified.\n`);
  return result.status === "pass" && result.programCount === 43 ? 0 : 1;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) void runCertificationCli().then((code) => process.exit(code)).catch((error) => { console.error(error); process.exit(1); });
