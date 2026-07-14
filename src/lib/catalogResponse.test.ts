import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeCatalogFallback } from "../../scripts/generate-catalog-fallback";
import * as schema from "@/db/schema";
import {
  CATALOG_FALLBACK,
  CatalogResponseSchema,
  type BulletinCatalogResponse,
} from "@/lib/data";
import {
  catalogResponseWithFallback,
  getRulesByStatus,
  type Db,
} from "@/lib/repository";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.doUnmock("@/data/catalog-fallback.json");
  vi.resetModules();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

function bulletinResponse(): BulletinCatalogResponse {
  const snapshotId = "bulletin-test-snapshot";
  const sourceHash = "bulletin-test-source-hash";
  const sourceUrl =
    "https://bulletins.nyu.edu/undergraduate/shanghai/programs/test/";
  return {
    snapshot: {
      id: snapshotId,
      sourceHash,
      kind: "bulletin",
      publishedAt: "2026-07-14T00:00:00.000Z",
    },
    courses: [
      {
        id: "TEST-SHU 101",
        title: "Test Course",
        credits: 4,
        department: "TEST-SHU",
        prereqs: [],
        sourceReferenceIds: [],
        offered: ["fall"],
        offeringKnown: true,
        sites: ["shanghai"],
        fulfills: [{ programId: "test", categoryId: "foundation" }],
        equivalentTo: [],
        attributes: [],
        tags: [],
        provenance: { sourceUrl, snapshotId, sourceHash },
      },
    ],
    programs: [
      {
        id: "test",
        name: "Test Program",
        shortName: "Test",
        type: "major",
        categories: [
          {
            id: "foundation",
            name: "Foundation",
            requirement: { kind: "course", courseId: "TEST-SHU 101" },
            sourceUrl,
            sourceTableId: "requirements",
            sourceRowIndexes: [0],
          },
        ],
        requirementRows: [
          {
            sourceUrl,
            tableId: "requirements",
            sourceIndex: 0,
            sourceText: "TEST-SHU 101 Test Course",
            categoryId: "foundation",
            nodePath: [],
            node: { kind: "course", courseId: "TEST-SHU 101" },
          },
        ],
        sourceRows: [
          {
            representation: "requirementNode",
            sourceUrl,
            tableId: "requirements",
            sourceIndex: 0,
            sourceText: "TEST-SHU 101 Test Course",
            categoryId: "foundation",
            nodePath: [],
          },
        ],
        sourceReferenceIds: ["TEST-SHU 101"],
        provenance: { sourceUrl, snapshotId, sourceHash },
      },
    ],
    rules: [],
  };
}

describe("CatalogResponseSchema", () => {
  it("loads an official fallback without forcing rich programs into legacy views", async () => {
    const bulletin = bulletinResponse();
    vi.resetModules();
    vi.doMock("@/data/catalog-fallback.json", () => ({ default: bulletin }));

    const dataModule = await import("@/lib/data");
    expect(dataModule.COURSES.map(({ id }) => id)).toEqual(["TEST-SHU 101"]);
    expect(dataModule.PROGRAMS).toEqual([]);
    expect(dataModule.BULLETIN_PROGRAMS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "test", provenance: expect.any(Object) }),
      ]),
    );
    await expect(import("@/lib/repository")).resolves.toBeDefined();

    const directory = await mkdtemp(join(tmpdir(), "catalog-fallback-"));
    temporaryDirectories.push(directory);
    const target = join(directory, "catalog-fallback.json");
    const generator = await import("../../scripts/generate-catalog-fallback");
    await generator.writeCatalogFallback(bulletin, target);
    await generator.writeCatalogFallback(bulletin, target);
    expect(
      CatalogResponseSchema.parse(JSON.parse(await readFile(target, "utf8")))
        .snapshot.kind,
    ).toBe("bulletin");
  });

  it("keeps official Bulletin and bootstrap legacy program shapes distinct", () => {
    const bulletin = bulletinResponse();
    expect(CatalogResponseSchema.parse(bulletin)).toMatchObject(bulletin);
    expect(CatalogResponseSchema.parse(CATALOG_FALLBACK)).toEqual(
      CATALOG_FALLBACK,
    );

    expect(
      CatalogResponseSchema.safeParse({
        ...bulletin,
        programs: CATALOG_FALLBACK.programs,
      }).success,
    ).toBe(false);
    expect(
      CatalogResponseSchema.safeParse({
        ...CATALOG_FALLBACK,
        programs: bulletin.programs,
      }).success,
    ).toBe(false);

    const incoherent = structuredClone(bulletin);
    incoherent.courses[0].provenance!.snapshotId = "different-snapshot";
    expect(CatalogResponseSchema.safeParse(incoherent).success).toBe(false);
  });

  it("uses the validated nonempty fallback on read or response validation failure", async () => {
    const failedRead = await catalogResponseWithFallback(async () => {
      throw new Error("database unavailable");
    });
    const invalidActiveRead = await catalogResponseWithFallback(async () => ({
      snapshot: {
        id: "active-but-corrupt",
        sourceHash: "corrupt",
        kind: "bulletin",
      },
      courses: [],
      programs: [],
      rules: [],
    }));

    expect(failedRead).toEqual(CATALOG_FALLBACK);
    expect(invalidActiveRead).toEqual(CATALOG_FALLBACK);
    expect(invalidActiveRead.courses.length).toBeGreaterThan(0);
    expect(invalidActiveRead.programs.length).toBeGreaterThan(0);
  });

  it("falls back when a valid rule schema references a missing catalog course", async () => {
    const incoherent = bulletinResponse();
    incoherent.rules = [
      {
        kind: "equivalence",
        id: "broken-equivalence",
        course: "TEST-SHU 101",
        target: "MISSING-SHU 999",
      },
    ];

    expect(await catalogResponseWithFallback(async () => incoherent)).toEqual(
      CATALOG_FALLBACK,
    );
  });

  it("falls back when a course targets a missing program category", async () => {
    const incoherent = bulletinResponse();
    incoherent.courses[0].fulfills = [
      { programId: "missing-program", categoryId: "missing-category" },
    ];

    expect(await catalogResponseWithFallback(async () => incoherent)).toEqual(
      CATALOG_FALLBACK,
    );
  });

  it("rejects rather than skips a malformed persisted active rule", async () => {
    const client = new PGlite();
    const database: Db = drizzle(client, { schema });
    await migrate(database, { migrationsFolder: "./drizzle" });
    await database.insert(schema.rules).values({
      id: "malformed-active-rule",
      kind: "equivalence",
      data: { kind: "equivalence", id: "malformed-active-rule" } as never,
      status: "active",
    });

    await expect(getRulesByStatus(database, "active")).rejects.toThrow();
    await client.close();
  });
});

describe("catalog fallback generation", () => {
  it("sorts a validated active response before writing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "catalog-fallback-"));
    temporaryDirectories.push(directory);
    const target = join(directory, "catalog-fallback.json");
    const input = bulletinResponse();
    input.courses = [
      { ...input.courses[0], id: "TEST-SHU 202", title: "Second" },
      input.courses[0],
    ];
    input.programs = [
      { ...input.programs[0], id: "z-program", name: "Z Program" },
      input.programs[0],
    ];

    await writeCatalogFallback(input, target);

    const written = CatalogResponseSchema.parse(
      JSON.parse(await readFile(target, "utf8")),
    );
    expect(written.courses.map((course) => course.id)).toEqual([
      "TEST-SHU 101",
      "TEST-SHU 202",
    ]);
    expect(written.programs.map((program) => program.id)).toEqual([
      "test",
      "z-program",
    ]);
  });

  it("refuses to overwrite the last-known-good file with empty data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "catalog-fallback-"));
    temporaryDirectories.push(directory);
    const target = join(directory, "catalog-fallback.json");
    const existing = "existing last-known-good\n";
    await writeFile(target, existing, "utf8");

    await expect(
      writeCatalogFallback(
        {
          snapshot: {
            id: "empty-active",
            sourceHash: "empty",
            kind: "bulletin",
          },
          courses: [],
          programs: [],
          rules: [],
        },
        target,
      ),
    ).rejects.toThrow(/empty|nonempty|non-empty/i);
    expect(await readFile(target, "utf8")).toBe(existing);
  });

  it("preserves prior bytes and cleans the temporary file when rename fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "catalog-fallback-"));
    temporaryDirectories.push(directory);
    const target = join(directory, "catalog-fallback.json");
    const existing = "existing last-known-good\n";
    await writeFile(target, existing, "utf8");
    const rename = vi.fn(async () => {
      throw new Error("injected atomic rename failure");
    });
    const atomicWrite = writeCatalogFallback as unknown as (
      input: unknown,
      targetPath: string,
      operations: { rename: typeof rename },
    ) => Promise<void>;

    await expect(
      atomicWrite(bulletinResponse(), target, { rename }),
    ).rejects.toThrow("injected atomic rename failure");
    expect(await readFile(target, "utf8")).toBe(existing);
    expect(await readdir(directory)).toEqual(["catalog-fallback.json"]);
  });
});
