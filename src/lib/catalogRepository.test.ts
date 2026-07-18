import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { normalizeBulletin } from "@/lib/bulletin/normalize";
import type { BulletinSourceDocument } from "@/lib/bulletin/parseCoursePage";
import type {
  BulletinProgramDocument,
  SourceTableRow,
} from "@/lib/bulletin/parseProgramPage";
import type { BulletinDiscovery } from "@/lib/bulletin/sourceTypes";
import { getCatalogSource } from "@/lib/bulletin/sourceRegistry";
import {
  validateCatalogCandidate,
  type SnapshotValidationReport,
} from "@/lib/bulletin/validateSnapshot";
import {
  getActiveCatalog,
  getCatalogStatus,
  publishCatalogCandidate,
  type CatalogDb,
} from "@/lib/catalogRepository";
import type { CatalogCandidate } from "@/lib/types";

let client: PGlite;
let db: CatalogDb;

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
});

const PROGRAM_URL =
  "https://bulletins.nyu.edu/undergraduate/shanghai/programs/test-program/";
const SUBJECT_URL =
  "https://bulletins.nyu.edu/undergraduate/shanghai/courses/test-shu/";

function sourceRow(
  role: SourceTableRow["role"],
  sourceIndex: number,
  text: string,
  linkedCourseCodes: string[] = [],
): SourceTableRow {
  return {
    role,
    sourceIndex,
    text,
    linkedCourseCodes,
    sourceAnchors: [],
    footnoteMarkers: [],
  };
}

function candidate(label: "A" | "B"): CatalogCandidate {
  const discovery: BulletinDiscovery = {
    sourceId: "nyu-shanghai",
    source: getCatalogSource("nyu-shanghai"),
    majors: [
      {
        kind: "major",
        slug: "test-program",
        title: `Test Program ${label}`,
        url: PROGRAM_URL,
      },
    ],
    minors: [],
    subjects: [
      {
        kind: "subject",
        slug: "test-shu",
        title: `Test Subject ${label}`,
        url: SUBJECT_URL,
      },
    ],
    programUrls: [PROGRAM_URL],
    courseIndexUrls: [
      "https://bulletins.nyu.edu/undergraduate/shanghai/courses/",
    ],
    coursePageUrls: [SUBJECT_URL],
    discoveredUrls: [PROGRAM_URL, SUBJECT_URL],
  };
  const subjectDocument: BulletinSourceDocument = {
    kind: "subject",
    slug: "test-shu",
    title: `Test Subject ${label}`,
    sourceUrl: SUBJECT_URL,
    courses: [
      {
        code: "TEST-SHU 101",
        title: `Test Course ${label}`,
        creditsText: "4 Credits",
        offeringText: "Fall",
        linkedCourseIds: [],
        attributes: [],
        detailTexts: [],
      },
    ],
  };
  const programDocument: BulletinProgramDocument = {
    kind: "program",
    slug: "test-program",
    title: `Test Program ${label}`,
    sourceUrl: PROGRAM_URL,
    sections: [],
    policies: [],
    footnotes: [],
    requirementTables: [
      {
        id: "program-requirements",
        sectionId: "requirements",
        rows: [
          sourceRow("areaHeader", 0, "Foundations"),
          sourceRow(
            "course",
            1,
            `TEST-SHU 101 Test Course ${label}`,
            ["TEST-SHU 101"],
          ),
        ],
      },
    ],
  };
  return normalizeBulletin(discovery, [subjectDocument, programDocument]);
}

function reportFor(input: CatalogCandidate): SnapshotValidationReport {
  return validateCatalogCandidate(input);
}

describe("catalog snapshot publication", () => {
  it("publishes candidate A as one coherent active catalog", async () => {
    const input = candidate("A");

    await publishCatalogCandidate(db, input, reportFor(input));

    expect(await getActiveCatalog(db)).toEqual(input);
    expect(await getCatalogStatus(db)).toMatchObject({
      active: {
        id: input.snapshotId,
        sourceHash: input.sourceHash,
        status: "active",
        documentCount: 2,
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
        { id: first.snapshotId, status: "retired" },
        { id: second.snapshotId, status: "active" },
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
        IF NEW."id" = '${second.snapshotId}' AND NEW."status" = 'active' THEN
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
        .where(eq(schema.catalogSnapshot.id, second.snapshotId)),
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

    expect(status.active?.id).toBe(first.snapshotId);
    expect(status.recent).toHaveLength(10);
  });

  it("rejects an active catalog whose persisted source document is malformed", async () => {
    const input = candidate("A");
    await publishCatalogCandidate(db, input, reportFor(input));
    const malformed = structuredClone(
      input.documents.find(
        (document) => (document as { kind?: string }).kind === "subject",
      ),
    ) as BulletinSourceDocument;
    (malformed.courses[0] as unknown as { linkedCourseIds: unknown }).linkedCourseIds =
      "not-an-array";
    await db
      .update(schema.catalogSourceDocument)
      .set({ data: malformed })
      .where(eq(schema.catalogSourceDocument.sourceUrl, SUBJECT_URL));

    await expect(getActiveCatalog(db)).rejects.toThrow(
      /invalid-source-document/i,
    );
  });

  it("rejects malformed persisted validation reports in catalog status", async () => {
    const input = candidate("A");
    await publishCatalogCandidate(db, input, reportFor(input));
    const malformed = structuredClone(reportFor(input)) as unknown as {
      summary: { courseCount: unknown };
    };
    malformed.summary.courseCount = "one";
    await db
      .update(schema.catalogSnapshot)
      .set({
        validationReport: malformed as unknown as SnapshotValidationReport,
      })
      .where(eq(schema.catalogSnapshot.id, input.snapshotId));

    await expect(getCatalogStatus(db)).rejects.toThrow();
  });

  it("accepts Task 6 failed reports with malformed source identity strings", async () => {
    const report: SnapshotValidationReport = {
      summary: {
        snapshotId: "",
        sourceHash: "",
        documentCount: 1,
        courseCount: 0,
        programCount: 0,
        sourceRowCount: 0,
        requirementRowCount: 0,
      },
      errors: [
        {
          code: "invalid-source-document",
          sourceUrl: "bad",
          entityId: "",
        },
      ],
      warnings: [],
    };
    await db.insert(schema.catalogSnapshot).values({
      id: "failed-malformed-source-identity",
      sourceHash: "",
      status: "failed",
      validationReport: report,
      documentCount: 1,
      courseCount: 0,
      programCount: 0,
      sourceReferenceIds: [],
      externalCourseIds: [],
      unresolvedCourseIds: [],
      failureSummary: "invalid-source-document",
      completedAt: new Date(),
    });

    const status = await getCatalogStatus(db);

    expect(status.recent[0].validationReport).toEqual(report);
  });
});
