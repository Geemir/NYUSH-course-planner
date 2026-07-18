import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_SOURCES } from "@/lib/bulletin/sourceRegistry";

const stubs = vi.hoisted(() => ({
  sync: vi.fn(),
  statuses: vi.fn(),
  activeRelease: vi.fn(),
  compose: vi.fn(),
}));

vi.mock("@/lib/bulletin/sync", () => ({
  syncCatalogSource: stubs.sync,
}));
vi.mock("@/lib/catalogRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/catalogRepository")>();
  return {
    ...actual,
    getCatalogSourceStatuses: stubs.statuses,
    getActiveCatalogRelease: stubs.activeRelease,
    composeCatalogRelease: stubs.compose,
  };
});

import { syncCatalogSources } from "@/lib/bulletin/syncAll";

const db = {} as Parameters<typeof syncCatalogSources>[0]["db"];
const fetchPage = vi.fn(async () => "");

function completeStatuses(overrides: Record<string, string | null> = {}) {
  return CATALOG_SOURCES.map((source) => ({
    sourceId: source.id,
    schoolName: source.schoolName,
    campus: source.campus,
    enabled: true,
    activeSnapshotId:
      Object.prototype.hasOwnProperty.call(overrides, source.id)
        ? overrides[source.id]
        : `${source.id}-active`,
    activeCourseCount: 1,
    quarantinedCount: 0,
    lastFailure: null,
  }));
}

describe("syncCatalogSources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubs.sync.mockImplementation(async ({ source }: { source: { id: string } }) => ({
      sourceId: source.id,
      status: "published",
      snapshotId: `${source.id}-new`,
      retainedSnapshotId: null,
      diagnostics: [],
    }));
    stubs.statuses.mockResolvedValue(completeStatuses());
    stubs.activeRelease.mockResolvedValue(null);
    stubs.compose.mockImplementation(async (_db: unknown, membership: Record<string, string>) => ({
      id: "release-new",
      sourceSnapshotIds: membership,
      publishedAt: new Date().toISOString(),
    }));
  });

  it("refreshes selected sources and composes them with last-known-good snapshots", async () => {
    const result = await syncCatalogSources({
      sourceIds: ["nyu-new-york-business"],
      fetchPage,
      db,
    });

    expect(result.complete).toBe(true);
    expect(result.releaseId).toBe("release-new");
    expect(stubs.sync).toHaveBeenCalledTimes(1);
    expect(stubs.compose).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        "nyu-shanghai": "nyu-shanghai-active",
        "nyu-new-york-business": "nyu-new-york-business-active",
      }),
    );
  });

  it("retains a previous healthy snapshot after a source failure", async () => {
    stubs.sync.mockResolvedValue({
      sourceId: "nyu-new-york-engineering",
      status: "failed",
      snapshotId: null,
      retainedSnapshotId: "nyu-new-york-engineering-active",
      diagnostics: ["fetch-failed"],
    });

    const result = await syncCatalogSources({
      sourceIds: ["nyu-new-york-engineering"],
      fetchPage,
      db,
    });

    expect(result.complete).toBe(true);
    expect(result.sourceResults[0]).toMatchObject({
      status: "failed",
      retainedSnapshotId: "nyu-new-york-engineering-active",
    });
    expect(stubs.compose).toHaveBeenCalledOnce();
  });

  it("does not activate an incomplete release and returns results in registry order", async () => {
    stubs.statuses.mockResolvedValue(
      completeStatuses({ "nyu-new-york-arts": null }),
    );

    const result = await syncCatalogSources({
      sourceIds: ["nyu-new-york-engineering", "nyu-new-york-business"],
      fetchPage,
      db,
    });

    expect(result.complete).toBe(false);
    expect(result.releaseId).toBeNull();
    expect(result.sourceResults.map((entry) => entry.sourceId)).toEqual([
      "nyu-new-york-business",
      "nyu-new-york-engineering",
    ]);
    expect(stubs.compose).not.toHaveBeenCalled();
  });
});
