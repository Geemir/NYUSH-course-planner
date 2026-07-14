import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, resolve } from "node:path";
import {
  BulletinCatalogResponseSchema,
  CatalogResponseSchema,
  type CatalogResponse,
} from "@/lib/data";

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
  const parsed = CatalogResponseSchema.parse(input);
  const sorted: CatalogResponse = {
    ...parsed,
    courses: [...parsed.courses].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    programs: [...parsed.programs].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    rules: [...parsed.rules].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  } as CatalogResponse;
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

export async function generateCatalogFallback(): Promise<void> {
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
  const validated = BulletinCatalogResponseSchema.parse(active);
  await writeCatalogFallback(validated);
  process.stdout.write(
    `Wrote ${validated.courses.length} courses and ${validated.programs.length} programs from ${validated.snapshot.id} to ${CATALOG_FALLBACK_PATH}.\n`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  generateCatalogFallback().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Catalog fallback generation failed: ${message}\n`);
    process.exitCode = 1;
  });
}
