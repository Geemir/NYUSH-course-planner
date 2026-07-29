import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, resolve } from "node:path";
import {
  PublicCatalogResponseSchema,
  type PublicCatalogResponse,
} from "@/lib/data";
import { assertPublishable } from "@/lib/bulletin/validateSnapshot";
import {
  CatalogCourseRecordSchema,
  type SourceCatalogCandidate,
} from "@/lib/catalog/types";
import { CatalogProgramSchema } from "@/lib/types";

export const CATALOG_FALLBACK_PATH = resolve(
  process.cwd(),
  "src/data/catalog-fallback.json",
);

interface FallbackFileOperations {
  writeFile: typeof writeFile;
  rename: typeof rename;
  rm: typeof rm;
}

const DEFAULT_FILE_OPERATIONS: FallbackFileOperations = {
  writeFile,
  rename,
  rm,
};

function assertNonemptyCatalog(input: unknown): void {
  if (
    typeof input !== "object" ||
    input === null ||
    !("courses" in input) ||
    !("programs" in input) ||
    !Array.isArray(input.courses) ||
    !Array.isArray(input.programs) ||
    input.courses.length === 0 ||
    input.programs.length === 0
  ) {
    throw new Error(
      "Refusing to overwrite the last-known-good fallback with an empty catalog.",
    );
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

/** Validates and serializes a deterministic fallback without mutating input. */
export function serializeCatalogFallback(input: unknown): string {
  assertNonemptyCatalog(input);
  const parsed = PublicCatalogResponseSchema.parse(input);
  const courseIdentity = (course: (typeof parsed.courses)[number]) =>
    "stableId" in course ? course.stableId : course.id;
  const sorted: PublicCatalogResponse = {
    ...parsed,
    courses: [...parsed.courses].sort((left, right) =>
      courseIdentity(left).localeCompare(courseIdentity(right)),
    ),
    programs: [...parsed.programs].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    rules: [...parsed.rules].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  } as PublicCatalogResponse;
  return `${JSON.stringify(stableValue(sorted), null, 2)}\n`;
}

/** Writes only after full validation, so invalid/empty reads preserve the LKG. */
export async function writeCatalogFallback(
  input: unknown,
  targetPath = CATALOG_FALLBACK_PATH,
  operationOverrides: Partial<FallbackFileOperations> = {},
): Promise<void> {
  const serialized = serializeCatalogFallback(input);
  const operations = { ...DEFAULT_FILE_OPERATIONS, ...operationOverrides };
  const temporaryPath = resolve(
    dirname(targetPath),
    `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await operations.writeFile(temporaryPath, serialized, {
      encoding: "utf8",
      flag: "wx",
    });
    await operations.rename(temporaryPath, targetPath);
  } catch (error) {
    try {
      await operations.rm(temporaryPath, { force: true });
    } catch {
      // Best effort only: preserve the original write/rename failure.
    }
    throw error;
  }
}

export function parseFallbackArgs(args: readonly string[]) {
  const candidate = args
    .find((arg) => arg.startsWith("--candidate="))
    ?.slice("--candidate=".length);
  return { candidate, help: args.includes("--help") };
}

async function fallbackFromCandidate(candidatePath: string): Promise<PublicCatalogResponse> {
  const root = JSON.parse(await readFile(resolve(candidatePath), "utf8")) as Record<string, unknown>;
  if (!("candidate" in root) || !("validationReport" in root)) {
    throw new Error("Fallback regeneration requires a generated candidate artifact.");
  }
  if (!root.candidate || typeof root.candidate !== "object") {
    throw new Error("Candidate payload is invalid.");
  }
  const raw = root.candidate as SourceCatalogCandidate;
  const candidate: SourceCatalogCandidate = {
    ...raw,
    courses: CatalogCourseRecordSchema.array().parse(raw.courses),
    programs: CatalogProgramSchema.array().parse(raw.programs),
  };
  assertPublishable(root.validationReport as Parameters<typeof assertPublishable>[0]);
  if (candidate.sourceId !== "nyu-shanghai") {
    throw new Error("The checked-in fallback must use the NYU Shanghai source.");
  }
  const current = PublicCatalogResponseSchema.parse(
    JSON.parse(await readFile(CATALOG_FALLBACK_PATH, "utf8")),
  );
  return PublicCatalogResponseSchema.parse({
    snapshot: {
      id: candidate.snapshotId,
      kind: "bulletin",
      sourceHash: candidate.sourceHash,
    },
    courses: candidate.courses.map((record) => record.course),
    programs: candidate.programs,
    rules: current.rules,
  });
}

export async function generateCatalogFallback(candidatePath?: string): Promise<void> {
  if (candidatePath) {
    const candidate = await fallbackFromCandidate(candidatePath);
    await writeCatalogFallback(candidate);
    process.stdout.write(
      `Wrote ${candidate.courses.length} courses and ${candidate.programs.length} programs from certified candidate to ${CATALOG_FALLBACK_PATH}.\n`,
    );
    return;
  }
  // Keep server-only imports behind the executable boundary so serialization
  // helpers remain importable in Vitest and other non-React-server contexts.
  const [{ db }, { readActiveCatalogResponse }] = await Promise.all([
    import("@/db"),
    import("@/lib/repository"),
  ]);
  const active = await readActiveCatalogResponse(db);
  if (!active) {
    throw new Error(
      "No active Bulletin catalog exists; the last-known-good fallback was not changed.",
    );
  }
  const validated = PublicCatalogResponseSchema.parse(active);
  await writeCatalogFallback(validated);
  const catalogId = "release" in validated ? validated.release.id : validated.snapshot.id;
  process.stdout.write(
    `Wrote ${validated.courses.length} courses and ${validated.programs.length} programs from ${catalogId} to ${CATALOG_FALLBACK_PATH}.\n`,
  );
}

export async function runCatalogFallbackCli({
  execute,
  stderr,
}: {
  execute: () => Promise<void>;
  stderr: (line: string) => void;
}): Promise<0 | 1> {
  try {
    await execute();
    return 0;
  } catch {
    stderr("Catalog fallback generation failed.");
    return 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const options = parseFallbackArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: catalog:generate-fallback -- [--candidate=<candidate-json>]\n");
    process.exit(0);
  }
  void runCatalogFallbackCli({
    execute: () => generateCatalogFallback(options.candidate),
    stderr: (line) => process.stderr.write(`${line}\n`),
  }).then((exitCode) => {
    process.exit(exitCode);
  });
}
