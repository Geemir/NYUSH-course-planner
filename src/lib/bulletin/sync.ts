import { discoverBulletinSources } from "@/lib/bulletin/discover";
import type { BulletinFetch } from "@/lib/bulletin/fetch";
import {
  normalizeBulletin,
  type BulletinDocument,
} from "@/lib/bulletin/normalize";
import { parseCoursePage } from "@/lib/bulletin/parseCoursePage";
import {
  parseProgramPage,
  type BulletinProgramPageSource,
} from "@/lib/bulletin/parseProgramPage";
import {
  assertPublishable,
  validateCatalogCandidate,
} from "@/lib/bulletin/validateSnapshot";
import {
  getActiveCatalog,
  publishCatalogCandidate,
  type CatalogDb,
} from "@/lib/catalogRepository";

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

let syncInProgress = false;

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
  if (syncInProgress) throw new BulletinSyncInProgressError();
  syncInProgress = true;

  try {
    const startedAt = now();
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
        parseCoursePage(fetched.get(source.url)!, source),
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
    syncInProgress = false;
  }
}
