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
  composeCatalogRelease,
  getActiveCatalog,
  getActiveCatalogRelease,
  getActiveReleaseCatalog,
  getCatalogSourceStatuses,
  getCatalogStatus,
  publishSourceCandidate,
  publishCatalogCandidate,
  type CatalogDb,
} from "@/lib/catalogRepository";
import type { CatalogCandidate } from "@/lib/types";
import type { SourceCatalogCandidate } from "@/lib/catalog/types";

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
    bulletinDisplay: {
      schemaVersion: 2,
      sourceUrl: PROGRAM_URL,
      sections: [
        {
          id: "requirements",
          heading: "",
          blocks: [
            {
              kind: "table",
              id: "program-requirements",
              caption: null,
              headingTrail: [],
              rows: [
                {
                  sourceIndex: 0,
                  role: "heading",
                  text: "Foundations",
                  creditsText: null,
                  linkedCourseCodes: [],
                  sourceAnchors: [],
                  footnoteMarkers: [],
                },
                {
                  sourceIndex: 1,
                  role: "course",
                  text: `TEST-SHU 101 Test Course ${label}`,
                  creditsText: null,
                  linkedCourseCodes: ["TEST-SHU 101"],
                  sourceAnchors: [],
                  footnoteMarkers: [],
                },
              ],
            },
          ],
        },
      ],
    },
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
    samplePlan: {
      sectionId: "sampleplanofstudytext",
      heading: "Sample Plan of Study",
      terms: Array.from({ length: 8 }, (_, index) => ({
        sourceIndex: index,
        heading: `Term ${index + 1}`,
        ordinal: index + 1,
        creditsText: null,
        rows: [],
      })),
      totalCreditsText: null,
      importStatus: "eligible",
      diagnostics: [],
    },
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

    const active = await getActiveCatalog(db);
    expect(active).toEqual(input);
    expect(active).toMatchObject({
      programs: [
        expect.objectContaining({
          bulletinDisplay: input.programs[0].bulletinDisplay,
          interpretations: input.programs[0].interpretations,
          samplePlan: input.programs[0].samplePlan,
        }),
      ],
    });
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

function sourceCandidate(
  sourceId: "nyu-shanghai" | "nyu-new-york-business",
  suffix: string,
): SourceCatalogCandidate {
  const source = getCatalogSource(sourceId);
  const code = sourceId === "nyu-shanghai" ? "TEST-SHU 101" : "ACCT-UB 1";
  const slug = sourceId === "nyu-shanghai" ? "test-shu" : "acct-ub";
  const sourceUrl = `${source.courseIndexUrl}${slug}/`;
  const snapshotId = `${sourceId}-snapshot-${suffix}`;
  return {
    sourceId,
    snapshotId,
    sourceHash: `${sourceId}-hash-${suffix}`,
    documents: [{ kind: "subject", slug, title: slug, sourceUrl, courses: [{}] }],
    courses: [
      {
        stableId: `${sourceId}:${code}`,
        sourceId,
        sourceSnapshotId: snapshotId,
        code,
        subject: code.split(" ")[0],
        level: "undergraduate",
        catalogOfferingTerms: [],
        catalogOfferingText: null,
        course: {
          id: code,
          title: `Course ${suffix}`,
          credits: 4,
          minCredits: 4,
          maxCredits: 4,
          department: code.split(" ")[0],
          prereqs: [],
          sourceReferenceIds: [],
          offered: sourceId === "nyu-shanghai" ? ["fall"] : [],
          offeringKnown: sourceId === "nyu-shanghai",
          sites: [source.campus],
          fulfills: [],
          equivalentTo: [],
          attributes: [],
          tags: [],
          provenance: { sourceUrl, snapshotId, sourceHash: "document-hash" },
        },
        crossListedStableIds: [],
      },
    ],
    programs: [],
    quarantinedCourses: [],
    sourceReferenceIds: [],
    unresolvedCourseIds: [],
  };
}

function sourceReport(input: SourceCatalogCandidate): SnapshotValidationReport {
  return {
    summary: {
      snapshotId: input.snapshotId,
      sourceHash: input.sourceHash,
      documentCount: input.documents.length,
      courseCount: input.courses.length,
      programCount: input.programs.length,
      sourceRowCount: 0,
      requirementRowCount: 0,
    },
    errors: [],
    warnings: [],
  };
}

describe("multi-source catalog releases", () => {
  it("publishes sources independently and composes an exact active release", async () => {
    const shanghai = sourceCandidate("nyu-shanghai", "a");
    const stern = sourceCandidate("nyu-new-york-business", "a");

    await expect(
      publishSourceCandidate(db, shanghai, sourceReport(shanghai)),
    ).resolves.toMatchObject({ status: "published", snapshotId: shanghai.snapshotId });
    await expect(
      publishSourceCandidate(db, stern, sourceReport(stern)),
    ).resolves.toMatchObject({ status: "published", snapshotId: stern.snapshotId });

    const activeSnapshots = await db
      .select({ sourceId: schema.catalogSnapshot.sourceId })
      .from(schema.catalogSnapshot)
      .where(eq(schema.catalogSnapshot.status, "active"));
    expect(activeSnapshots).toEqual(
      expect.arrayContaining([
        { sourceId: "nyu-shanghai" },
        { sourceId: "nyu-new-york-business" },
      ]),
    );

    const release = await composeCatalogRelease(db, {
      "nyu-shanghai": shanghai.snapshotId,
      "nyu-new-york-business": stern.snapshotId,
    });
    expect(release.sourceSnapshotIds).toEqual({
      "nyu-shanghai": shanghai.snapshotId,
      "nyu-new-york-business": stern.snapshotId,
    });
    await expect(getActiveCatalogRelease(db)).resolves.toMatchObject({
      id: release.id,
      sourceSnapshotIds: release.sourceSnapshotIds,
    });
    await expect(getActiveReleaseCatalog(db)).resolves.toMatchObject({
      release: { id: release.id },
      courses: expect.arrayContaining([
        expect.objectContaining({ sourceId: "nyu-shanghai" }),
        expect.objectContaining({ sourceId: "nyu-new-york-business" }),
      ]),
      programs: [],
    });
    await expect(getCatalogSourceStatuses(db)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "nyu-shanghai", activeSnapshotId: shanghai.snapshotId }),
        expect.objectContaining({ sourceId: "nyu-new-york-business", activeSnapshotId: stern.snapshotId }),
      ]),
    );
  });

  it("backfills a v0.1 Shanghai snapshot into an active one-source release", async () => {
    const rehearsal = new PGlite();
    const applySql = async (fileName: string) => {
      const migration = readFileSync(resolve("drizzle", fileName), "utf8");
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) await rehearsal.exec(statement);
      }
    };
    for (const fileName of [
      "0000_smart_darkstar.sql",
      "0001_futuristic_gateway.sql",
      "0002_magenta_nuke.sql",
      "0003_bulletin_snapshots.sql",
    ]) {
      await applySql(fileName);
    }
    const legacyCourse = {
      id: "TEST-SHU 101",
      title: "Legacy Course",
      credits: 4,
      department: "TEST-SHU",
      offered: ["fall"],
      sites: ["shanghai"],
    };
    await rehearsal.query(
      `INSERT INTO "catalogSnapshot" ("id", "sourceHash", "status", "validationReport", "documentCount", "courseCount", "programCount", "sourceReferenceIds", "externalCourseIds", "unresolvedCourseIds") VALUES ($1, $2, 'active', $3::jsonb, 0, 1, 0, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)`,
      ["legacy-active", "legacy-hash", JSON.stringify(sourceReport(sourceCandidate("nyu-shanghai", "legacy")))],
    );
    await rehearsal.query(
      `INSERT INTO "catalogCourse" ("snapshotId", "courseId", "data") VALUES ($1, $2, $3::jsonb)`,
      ["legacy-active", legacyCourse.id, JSON.stringify(legacyCourse)],
    );

    await applySql("0004_multi_source_catalog.sql");

    const courses = await rehearsal.query<{
      stableId: string;
      sourceId: string;
      code: string;
      title: string;
    }>(`SELECT "stableId", "sourceId", "code", "title" FROM "catalogCourse"`);
    expect(courses.rows).toEqual([
      {
        stableId: "nyu-shanghai:TEST-SHU 101",
        sourceId: "nyu-shanghai",
        code: "TEST-SHU 101",
        title: "Legacy Course",
      },
    ]);
    const releases = await rehearsal.query<{ sourceSnapshotIds: Record<string, string> }>(
      `SELECT "sourceSnapshotIds" FROM "catalogRelease" WHERE "status" = 'active'`,
    );
    expect(releases.rows[0].sourceSnapshotIds).toEqual({
      "nyu-shanghai": "legacy-active",
    });
    await rehearsal.close();
  });

  it("reuses an unchanged healthy source snapshot", async () => {
    const stern = sourceCandidate("nyu-new-york-business", "same");
    await publishSourceCandidate(db, stern, sourceReport(stern));
    const duplicate = { ...stern, snapshotId: `${stern.snapshotId}-duplicate` };
    duplicate.courses = stern.courses.map((record) => ({
      ...record,
      sourceSnapshotId: duplicate.snapshotId,
    }));

    await expect(
      publishSourceCandidate(db, duplicate, sourceReport(duplicate)),
    ).resolves.toEqual({ status: "unchanged", snapshotId: stern.snapshotId });
  });

  it("rejects failed or cross-source release membership and preserves the active release", async () => {
    const shanghai = sourceCandidate("nyu-shanghai", "healthy");
    const stern = sourceCandidate("nyu-new-york-business", "healthy");
    await publishSourceCandidate(db, shanghai, sourceReport(shanghai));
    await publishSourceCandidate(db, stern, sourceReport(stern));
    const release = await composeCatalogRelease(db, {
      "nyu-shanghai": shanghai.snapshotId,
      "nyu-new-york-business": stern.snapshotId,
    });

    await expect(
      composeCatalogRelease(db, {
        "nyu-shanghai": shanghai.snapshotId,
        "nyu-new-york-business": shanghai.snapshotId,
      }),
    ).rejects.toThrow(/source|snapshot/i);
    await expect(getActiveCatalogRelease(db)).resolves.toMatchObject({ id: release.id });
  });
});
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
