import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  getActiveCatalog,
  getCatalogStatus,
  publishCatalogCandidate,
  type CatalogDb,
} from "@/lib/catalogRepository";
import type { SnapshotValidationReport } from "@/lib/bulletin/validateSnapshot";
import type { CatalogCandidate } from "@/lib/types";

let client: PGlite;
let db: CatalogDb;

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
});

function candidate(label: "A" | "B"): CatalogCandidate {
  const snapshotId = `snapshot-${label.toLowerCase()}`;
  const sourceUrl = `https://bulletins.nyu.edu/undergraduate/shanghai/courses/test-${label.toLowerCase()}/`;
  return {
    snapshotId,
    sourceHash: `catalog-hash-${label.toLowerCase()}`,
    documents: [
      {
        kind: "subject",
        slug: `test-${label.toLowerCase()}`,
        title: `Test subject ${label}`,
        sourceUrl,
        courses: [],
      },
    ],
    courses: [
      {
        id: "TEST-SHU 101",
        title: `Test Course ${label}`,
        credits: 4,
        minCredits: 4,
        maxCredits: 4,
        department: "TEST-SHU",
        prereqs: [],
        sourceReferenceIds: [],
        offered: ["fall"],
        offeringKnown: true,
        sites: ["shanghai"],
        fulfills: [],
        equivalentTo: [],
        attributes: [],
        tags: [],
        provenance: {
          sourceUrl,
          snapshotId,
          sourceHash: `document-hash-${label.toLowerCase()}`,
        },
      },
    ],
    programs: [
      {
        id: "test-program",
        name: `Test Program ${label}`,
        shortName: `Test ${label}`,
        type: "major",
        categories: [],
        requirementRows: [],
        sourceRows: [],
        sourceReferenceIds: [],
        provenance: {
          sourceUrl,
          snapshotId,
          sourceHash: `document-hash-${label.toLowerCase()}`,
        },
      },
    ],
    sourceReferenceIds: [],
    externalCourseIds: [],
    unresolvedCourseIds: [],
  };
}

function reportFor(input: CatalogCandidate): SnapshotValidationReport {
  return {
    summary: {
      snapshotId: input.snapshotId,
      sourceHash: input.sourceHash,
      documentCount: input.documents.length,
      courseCount: input.courses.length,
      programCount: input.programs.length,
      sourceRowCount: input.programs.reduce(
        (count, program) => count + program.sourceRows.length,
        0,
      ),
      requirementRowCount: input.programs.reduce(
        (count, program) => count + program.requirementRows.length,
        0,
      ),
    },
    errors: [],
    warnings: [],
  };
}

describe("catalog snapshot publication", () => {
  it("publishes candidate A as one coherent active catalog", async () => {
    const input = candidate("A");

    await publishCatalogCandidate(db, input, reportFor(input));

    expect(await getActiveCatalog(db)).toEqual(input);
    expect(await getCatalogStatus(db)).toMatchObject({
      active: {
        id: "snapshot-a",
        sourceHash: "catalog-hash-a",
        status: "active",
        documentCount: 1,
        courseCount: 1,
        programCount: 1,
      },
    });
  });

  it("publishes B coherently and retires A with both histories intact", async () => {
    const first = candidate("A");
    const second = candidate("B");
    await publishCatalogCandidate(db, first, reportFor(first));

    await publishCatalogCandidate(db, second, reportFor(second));

    expect(await getActiveCatalog(db)).toEqual(second);
    const snapshots = await db
      .select({ id: schema.catalogSnapshot.id, status: schema.catalogSnapshot.status })
      .from(schema.catalogSnapshot);
    expect(snapshots).toEqual(
      expect.arrayContaining([
        { id: "snapshot-a", status: "retired" },
        { id: "snapshot-b", status: "active" },
      ]),
    );
    expect(
      await db.select().from(schema.catalogCourse),
    ).toHaveLength(2);
    expect(
      await db.select().from(schema.catalogProgram),
    ).toHaveLength(2);
  });

  it("rolls back retirement when the final activation write fails", async () => {
    const first = candidate("A");
    const second = candidate("B");
    await publishCatalogCandidate(db, first, reportFor(first));
    await client.exec(`
      CREATE FUNCTION fail_snapshot_b_activation() RETURNS trigger AS $$
      BEGIN
        IF NEW."id" = 'snapshot-b' AND NEW."status" = 'active' THEN
          RAISE EXCEPTION 'injected activation failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER inject_catalog_activation_failure
        BEFORE UPDATE ON "catalogSnapshot"
        FOR EACH ROW EXECUTE FUNCTION fail_snapshot_b_activation();
    `);

    await expect(
      publishCatalogCandidate(db, second, reportFor(second)),
    ).rejects.toThrow();

    expect(await getActiveCatalog(db)).toEqual(first);
    expect(
      await db
        .select()
        .from(schema.catalogSnapshot)
        .where(eq(schema.catalogSnapshot.id, "snapshot-b")),
    ).toHaveLength(0);
  });

  it("enforces exactly one active snapshot at the database boundary", async () => {
    const first = candidate("A");
    await publishCatalogCandidate(db, first, reportFor(first));

    await expect(
      db.insert(schema.catalogSnapshot).values({
        id: "snapshot-forced-active",
        sourceHash: "forced-hash",
        status: "active",
        validationReport: reportFor(first),
        documentCount: 0,
        courseCount: 0,
        programCount: 0,
        sourceReferenceIds: [],
        externalCourseIds: [],
        unresolvedCourseIds: [],
        completedAt: new Date(),
      }),
    ).rejects.toThrow();

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.catalogSnapshot)
      .where(eq(schema.catalogSnapshot.status, "active"));
    expect(count).toBe(1);
  });

  it("reports the active snapshot even after ten newer failed runs", async () => {
    const first = candidate("A");
    await publishCatalogCandidate(db, first, reportFor(first));
    await db.insert(schema.catalogSnapshot).values(
      Array.from({ length: 10 }, (_, index) => ({
        id: `failed-${index}`,
        sourceHash: `failed-hash-${index}`,
        status: "failed" as const,
        validationReport: reportFor(first),
        documentCount: 0,
        courseCount: 0,
        programCount: 0,
        sourceReferenceIds: [],
        externalCourseIds: [],
        unresolvedCourseIds: [],
        failureSummary: "injected pre-publication failure",
        startedAt: new Date(Date.UTC(2100, 0, 1, 0, 0, index)),
        completedAt: new Date(Date.UTC(2100, 0, 1, 0, 0, index)),
      })),
    );

    const status = await getCatalogStatus(db);

    expect(status.active?.id).toBe("snapshot-a");
    expect(status.recent).toHaveLength(10);
  });
});
