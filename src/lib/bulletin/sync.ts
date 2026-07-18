import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  discoverBulletinSource,
  discoverBulletinSources,
} from "@/lib/bulletin/discover";
import type { BulletinFetch } from "@/lib/bulletin/fetch";
import {
  normalizeBulletin,
  normalizeBulletinSource,
  type BulletinDocument,
} from "@/lib/bulletin/normalize";
import { parseCoursePage } from "@/lib/bulletin/parseCoursePage";
import {
  parseProgramPage,
  type BulletinProgramPageSource,
} from "@/lib/bulletin/parseProgramPage";
import {
  assertPublishable,
  BulletinValidationError,
  validateCatalogCandidate,
  validateSourceCatalogCandidate,
  type SnapshotValidationReport,
} from "@/lib/bulletin/validateSnapshot";
import {
  getActiveCatalog,
  ensureCatalogSource,
  getCatalogSourceStatuses,
  publishCatalogCandidate,
  publishSourceCandidate,
  type CatalogDb,
} from "@/lib/catalogRepository";
import type { CatalogSourceDefinition } from "@/lib/catalog/types";

const CORE_SOURCE = {
  kind: "core",
  slug: "core-curriculum",
  title: "Core Curriculum",
  url: "https://bulletins.nyu.edu/undergraduate/shanghai/core-curriculum/",
} as const satisfies BulletinProgramPageSource;

export interface SyncResult {
  outcome: "published" | "no-op";
  snapshotId: string;
  documentCount: number;
  courseCount: number;
  programCount: number;
  startedAt: Date;
  completedAt: Date;
}

export interface SyncBulletinOptions {
  fetcher: BulletinFetch;
  db: CatalogDb;
  now: () => Date;
}

export class BulletinSyncInProgressError extends Error {
  constructor() {
    super("A Bulletin synchronization is already in progress.");
    this.name = "BulletinSyncInProgressError";
  }
}

export const BULLETIN_SYNC_LOCK_ID = "__bulletin_sync_lock__";

function sourceLockId(sourceId?: string) {
  return sourceId && sourceId !== "nyu-shanghai"
    ? `${BULLETIN_SYNC_LOCK_ID}:${sourceId}`
    : BULLETIN_SYNC_LOCK_ID;
}

function lockValidationReport(
  ownerToken: string,
): SnapshotValidationReport {
  return {
    summary: {
      snapshotId: BULLETIN_SYNC_LOCK_ID,
      sourceHash: ownerToken,
      documentCount: 0,
      courseCount: 0,
      programCount: 0,
      sourceRowCount: 0,
      requirementRowCount: 0,
    },
    errors: [],
    warnings: [],
  };
}

/** Atomically acquires the cross-process synchronization lease row. */
export async function acquireBulletinSyncLock(
  db: CatalogDb,
  ownerToken: string,
  startedAt: Date,
  sourceId = "nyu-shanghai",
): Promise<void> {
  const lockId = sourceLockId(sourceId);
  const inserted = await db
    .insert(schema.catalogSnapshot)
    .values({
      id: lockId,
      sourceId,
      sourceHash: ownerToken,
      status: "building",
      validationReport: lockValidationReport(ownerToken),
      documentCount: 0,
      courseCount: 0,
      programCount: 0,
      sourceReferenceIds: [],
      externalCourseIds: [],
      unresolvedCourseIds: [],
      failureSummary: "Bulletin synchronization lock",
      startedAt,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]?.sourceHash !== ownerToken) {
    throw new BulletinSyncInProgressError();
  }
}

/** Releases only the lease owned by this exact synchronization invocation. */
export async function releaseBulletinSyncLock(
  db: CatalogDb,
  ownerToken: string,
  sourceId = "nyu-shanghai",
): Promise<void> {
  await db
    .delete(schema.catalogSnapshot)
    .where(
      and(
        eq(schema.catalogSnapshot.id, sourceLockId(sourceId)),
        eq(schema.catalogSnapshot.sourceHash, ownerToken),
        eq(schema.catalogSnapshot.status, "building"),
      ),
    );
}

function result(
  outcome: SyncResult["outcome"],
  candidate: {
    snapshotId: string;
    documents: readonly unknown[];
    courses: readonly unknown[];
    programs: readonly unknown[];
  },
  startedAt: Date,
  completedAt: Date,
): SyncResult {
  return {
    outcome,
    snapshotId: candidate.snapshotId,
    documentCount: candidate.documents.length,
    courseCount: candidate.courses.length,
    programCount: candidate.programs.length,
    startedAt,
    completedAt,
  };
}

/** Runs one complete, all-or-nothing NYU Shanghai Bulletin synchronization. */
export async function syncBulletin({
  fetcher,
  db,
  now,
}: SyncBulletinOptions): Promise<SyncResult> {
  const ownerToken = randomUUID();
  const startedAt = now();
  await acquireBulletinSyncLock(db, ownerToken, startedAt);

  try {
    const discovery = await discoverBulletinSources(fetcher);
    const programSources = [...discovery.majors, ...discovery.minors];
    const sources = [...programSources, ...discovery.subjects, CORE_SOURCE];
    const fetched = new Map<string, string>();

    // Fetch the complete allowed detail-page set before parsing any page. A
    // single failure therefore aborts before normalization or repository I/O.
    for (const source of sources) {
      fetched.set(source.url, await fetcher(source.url));
    }

    const documents: BulletinDocument[] = [
      ...programSources.map((source) =>
        parseProgramPage(fetched.get(source.url)!, source),
      ),
      ...discovery.subjects.map((source) =>
        parseCoursePage({
          source: discovery.source,
          sourceUrl: source.url,
          html: fetched.get(source.url)!,
        }),
      ),
      parseProgramPage(fetched.get(CORE_SOURCE.url)!, CORE_SOURCE),
    ];
    const candidate = normalizeBulletin(discovery, documents);
    const validationReport = validateCatalogCandidate(candidate);
    try {
      assertPublishable(validationReport);
    } catch (validationError) {
      // Task 7 records pre-publication validation failures as failed snapshot
      // outcomes without entering the activation transaction.
      await publishCatalogCandidate(db, candidate, validationReport);
      throw validationError;
    }

    const active = await getActiveCatalog(db);
    if (active?.sourceHash === candidate.sourceHash) {
      return result("no-op", candidate, startedAt, now());
    }

    await publishCatalogCandidate(db, candidate, validationReport);
    return result("published", candidate, startedAt, now());
  } finally {
    // A crashed process intentionally leaves a stale row rather than silently
    // allowing concurrent takeover. Operators must inspect and remove it.
    await releaseBulletinSyncLock(db, ownerToken);
  }
}

export interface SourceSyncResult {
  sourceId: string;
  status: "published" | "unchanged" | "failed";
  snapshotId: string | null;
  retainedSnapshotId: string | null;
  diagnostics: string[];
}

export interface SyncCatalogSourceOptions {
  source: CatalogSourceDefinition;
  fetcher: BulletinFetch;
  db: CatalogDb;
  now?: () => Date;
}

/** Refreshes one registry source under a source-scoped cross-process lock. */
export async function syncCatalogSource({
  source,
  fetcher,
  db,
  now = () => new Date(),
}: SyncCatalogSourceOptions): Promise<SourceSyncResult> {
  await ensureCatalogSource(db, source.id);
  const ownerToken = randomUUID();
  await acquireBulletinSyncLock(db, ownerToken, now(), source.id);
  try {
    const discovery = await discoverBulletinSource(source, fetcher);
    const programSources = source.includePrograms
      ? [...discovery.majors, ...discovery.minors]
      : [];
    const detailSources = [
      ...programSources,
      ...discovery.subjects,
      ...(source.id === "nyu-shanghai" ? [CORE_SOURCE] : []),
    ];
    const fetched = new Map<string, string>();
    for (const detailSource of detailSources) {
      fetched.set(detailSource.url, await fetcher(detailSource.url));
    }
    const documents: BulletinDocument[] = [
      ...programSources.map((program) =>
        parseProgramPage(fetched.get(program.url)!, program),
      ),
      ...discovery.subjects.map((subject) =>
        parseCoursePage({
          source,
          sourceUrl: subject.url,
          html: fetched.get(subject.url)!,
        }),
      ),
      ...(source.id === "nyu-shanghai"
        ? [parseProgramPage(fetched.get(CORE_SOURCE.url)!, CORE_SOURCE)]
        : []),
    ];
    const candidate = normalizeBulletinSource(discovery, documents);
    const previous = (await getCatalogSourceStatuses(db)).find(
      (status) => status.sourceId === source.id,
    );
    const report = validateSourceCatalogCandidate(candidate, {
      source,
      expectedSubjectCount: discovery.subjects.length,
      previousCourseCount: previous?.activeCourseCount,
    });
    assertPublishable(report);
    const publication = await publishSourceCandidate(db, candidate, report);
    return {
      sourceId: source.id,
      status: publication.status,
      snapshotId: publication.snapshotId,
      retainedSnapshotId: null,
      diagnostics: report.warnings.map((warning) => warning.code),
    };
  } catch (error) {
    const retained = (await getCatalogSourceStatuses(db)).find(
      (status) => status.sourceId === source.id,
    )?.activeSnapshotId;
    return {
      sourceId: source.id,
      status: "failed",
      snapshotId: null,
      retainedSnapshotId: retained ?? null,
      diagnostics:
        error instanceof BulletinValidationError
          ? error.codes
          : [error instanceof BulletinSyncInProgressError ? "source-locked" : "source-sync-failed"],
    };
  } finally {
    await releaseBulletinSyncLock(db, ownerToken, source.id);
  }
}
