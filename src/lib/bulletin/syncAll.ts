import type { BulletinFetch } from "@/lib/bulletin/fetch";
import {
  CATALOG_SOURCES,
  getCatalogSource,
} from "@/lib/bulletin/sourceRegistry";
import {
  syncCatalogSource,
  type SourceSyncResult,
} from "@/lib/bulletin/sync";
import {
  composeCatalogRelease,
  getActiveCatalogRelease,
  getCatalogSourceStatuses,
  type CatalogDb,
} from "@/lib/catalogRepository";

export interface CatalogSyncResult {
  releaseId: string | null;
  sourceResults: SourceSyncResult[];
  complete: boolean;
}

export async function syncCatalogSources(options: {
  sourceIds?: string[];
  fetchPage: BulletinFetch;
  db: CatalogDb;
}): Promise<CatalogSyncResult> {
  const requested = options.sourceIds ?? CATALOG_SOURCES.filter(
    (source) => source.enabled,
  ).map((source) => source.id);
  const requestedSet = new Set(requested);
  requested.forEach((sourceId) => getCatalogSource(sourceId));
  const selectedSources = CATALOG_SOURCES.filter(
    (source) => source.enabled && requestedSet.has(source.id),
  );
  if (selectedSources.length !== requestedSet.size) {
    throw new Error("A disabled catalog source cannot be synchronized.");
  }

  const sourceResults: SourceSyncResult[] = [];
  for (const source of selectedSources) {
    try {
      sourceResults.push(
        await syncCatalogSource({
          source,
          fetcher: options.fetchPage,
          db: options.db,
        }),
      );
    } catch {
      sourceResults.push({
        sourceId: source.id,
        status: "failed",
        snapshotId: null,
        retainedSnapshotId: null,
        diagnostics: ["source-sync-failed"],
      });
    }
  }

  const statuses = await getCatalogSourceStatuses(options.db);
  const activeBySource = new Map(
    statuses.map((status) => [status.sourceId, status.activeSnapshotId] as const),
  );
  const enabledSources = CATALOG_SOURCES.filter((source) => source.enabled);
  const complete = enabledSources.every(
    (source) => activeBySource.get(source.id) != null,
  );
  if (!complete) {
    return { releaseId: null, sourceResults, complete: false };
  }

  const membership = Object.fromEntries(
    enabledSources.map((source) => [source.id, activeBySource.get(source.id)!]),
  );
  const activeRelease = await getActiveCatalogRelease(options.db);
  if (
    activeRelease &&
    JSON.stringify(activeRelease.sourceSnapshotIds) === JSON.stringify(membership)
  ) {
    return { releaseId: activeRelease.id, sourceResults, complete: true };
  }
  const release = await composeCatalogRelease(options.db, membership);
  return { releaseId: release.id, sourceResults, complete: true };
}
