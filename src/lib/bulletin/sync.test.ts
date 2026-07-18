import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { BulletinDiscovery } from "@/lib/bulletin/sourceTypes";
import { getCatalogSource } from "@/lib/bulletin/sourceRegistry";
import type { SnapshotValidationReport } from "@/lib/bulletin/validateSnapshot";
import type { CatalogCandidate } from "@/lib/types";

const PROGRAM_URL =
  "https://bulletins.nyu.edu/undergraduate/shanghai/programs/computer-science-bs/";
const MINOR_URL =
  "https://bulletins.nyu.edu/undergraduate/shanghai/programs/computer-science-minor/";
const SUBJECT_URL =
  "https://bulletins.nyu.edu/undergraduate/shanghai/courses/csci-shu/";
const CORE_URL =
  "https://bulletins.nyu.edu/undergraduate/shanghai/core-curriculum/";

const discovery: BulletinDiscovery = {
  sourceId: "nyu-shanghai",
  source: getCatalogSource("nyu-shanghai"),
  majors: [
    {
      kind: "major",
      slug: "computer-science-bs",
      title: "Computer Science (BS)",
      url: PROGRAM_URL,
    },
  ],
  minors: [
    {
      kind: "minor",
      slug: "computer-science-minor",
      title: "Computer Science Minor",
      url: MINOR_URL,
    },
  ],
  subjects: [
    {
      kind: "subject",
      slug: "csci-shu",
      title: "Computer Science (CSCI-SHU)",
      url: SUBJECT_URL,
    },
  ],
  programUrls: [PROGRAM_URL, MINOR_URL],
  courseIndexUrls: [
    "https://bulletins.nyu.edu/undergraduate/shanghai/courses/",
  ],
  coursePageUrls: [SUBJECT_URL],
  discoveredUrls: [PROGRAM_URL, MINOR_URL, SUBJECT_URL],
};

const candidate: CatalogCandidate = {
  snapshotId: "bulletin-0123456789abcdef01234567",
  sourceHash: "0123456789abcdef0123456789abcdef",
  documents: [
    { kind: "program", sourceUrl: PROGRAM_URL },
    { kind: "program", sourceUrl: MINOR_URL },
    { kind: "subject", sourceUrl: SUBJECT_URL },
    { kind: "core", sourceUrl: CORE_URL },
  ],
  courses: [{ id: "CSCI-SHU 101" }] as CatalogCandidate["courses"],
  programs: [
    { id: "computer-science-bs" },
    { id: "computer-science-minor" },
    { id: "core-curriculum" },
  ] as CatalogCandidate["programs"],
  sourceReferenceIds: [],
  externalCourseIds: [],
  unresolvedCourseIds: [],
};

const validReport: SnapshotValidationReport = {
  summary: {
    snapshotId: candidate.snapshotId,
    sourceHash: candidate.sourceHash,
    documentCount: 4,
    courseCount: 1,
    programCount: 3,
    sourceRowCount: 0,
    requirementRowCount: 0,
  },
  errors: [],
  warnings: [],
};

const stubs = vi.hoisted(() => ({
  events: [] as string[],
  report: undefined as SnapshotValidationReport | undefined,
  active: null as CatalogCandidate | null,
  discoveryFetcher: undefined as unknown,
  session: null as
    | null
    | { user?: { id?: string; role?: "student" | "admin" } },
  publish: vi.fn(async (...args: [unknown, unknown, unknown]) => {
    void args;
  }),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => stubs.session),
}));

vi.mock("@/lib/bulletin/discover", () => ({
  discoverBulletinSources: vi.fn(async (fetcher: unknown) => {
    stubs.events.push("discover");
    stubs.discoveryFetcher = fetcher;
    return discovery;
  }),
}));

vi.mock("@/lib/bulletin/parseCoursePage", () => ({
  parseCoursePage: vi.fn((options: { sourceUrl: string }) => {
    stubs.events.push(`parse:${options.sourceUrl}`);
    return { kind: "subject", sourceUrl: options.sourceUrl };
  }),
}));

vi.mock("@/lib/bulletin/parseProgramPage", () => ({
  parseProgramPage: vi.fn((_html: string, source: { url: string }) => {
    stubs.events.push(`parse:${source.url}`);
    return {
      kind: source.url === CORE_URL ? "core" : "program",
      sourceUrl: source.url,
    };
  }),
}));

vi.mock("@/lib/bulletin/normalize", () => ({
  normalizeBulletin: vi.fn(() => {
    stubs.events.push("normalize");
    return candidate;
  }),
}));

vi.mock("@/lib/bulletin/validateSnapshot", () => ({
  validateCatalogCandidate: vi.fn(() => {
    stubs.events.push("validate");
    return stubs.report;
  }),
  assertPublishable: vi.fn((report: SnapshotValidationReport) => {
    if (report.errors.length > 0) throw new Error("validation failed");
  }),
}));

vi.mock("@/lib/catalogRepository", () => ({
  getActiveCatalog: vi.fn(async () => {
    stubs.events.push("hash-check");
    return stubs.active;
  }),
  publishCatalogCandidate: vi.fn(async (...args: [unknown, unknown, unknown]) => {
    stubs.events.push("publish");
    return stubs.publish(...args);
  }),
}));

import {
  acquireBulletinSyncLock,
  BulletinSyncInProgressError,
  releaseBulletinSyncLock,
  syncBulletin,
} from "@/lib/bulletin/sync";
import { requireAdmin } from "@/lib/adminAuth";

let client: PGlite;
let db: Parameters<typeof syncBulletin>[0]["db"];
const now = vi.fn(() => new Date("2026-07-14T00:00:00.000Z"));

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
});

afterAll(async () => {
  await client.close();
});

function resetStubs() {
  stubs.events.length = 0;
  stubs.report = validReport;
  stubs.active = null;
  stubs.discoveryFetcher = undefined;
  stubs.publish.mockClear();
  stubs.publish.mockImplementation(async (...args) => {
    void args;
  });
  now.mockClear();
}

function successfulFetcher() {
  return vi.fn(async (url: string) => {
    stubs.events.push(`fetch:${url}`);
    return `<html data-url="${url}"></html>`;
  });
}

describe("syncBulletin", () => {
  it("runs discover, all detail fetches, parse, normalize, validate, hash check, and publish in order", async () => {
    resetStubs();
    const fetcher = successfulFetcher();

    await syncBulletin({ fetcher, db, now });

    expect(stubs.events).toEqual([
      "discover",
      `fetch:${PROGRAM_URL}`,
      `fetch:${MINOR_URL}`,
      `fetch:${SUBJECT_URL}`,
      `fetch:${CORE_URL}`,
      `parse:${PROGRAM_URL}`,
      `parse:${MINOR_URL}`,
      `parse:${SUBJECT_URL}`,
      `parse:${CORE_URL}`,
      "normalize",
      "validate",
      "hash-check",
      "publish",
    ]);
    expect(stubs.discoveryFetcher).toBe(fetcher);
  });

  it("returns a content-hash no-op without publishing", async () => {
    resetStubs();
    stubs.active = structuredClone(candidate);

    const result = await syncBulletin({
      fetcher: successfulFetcher(),
      db,
      now,
    });

    expect(result).toEqual({
      outcome: "no-op",
      snapshotId: candidate.snapshotId,
      documentCount: 4,
      courseCount: 1,
      programCount: 3,
      startedAt: new Date("2026-07-14T00:00:00.000Z"),
      completedAt: new Date("2026-07-14T00:00:00.000Z"),
    });
    expect(stubs.events).not.toContain("publish");
  });

  it("releases the database lock after a detail fetch failure", async () => {
    resetStubs();
    const fetcher = vi.fn(async (url: string) => {
      stubs.events.push(`fetch:${url}`);
      if (url === MINOR_URL) throw new Error("fixture fetch failed");
      return "fixture html";
    });

    await expect(syncBulletin({ fetcher, db, now })).rejects.toThrow(
      "fixture fetch failed",
    );

    expect(stubs.events).toEqual([
      "discover",
      `fetch:${PROGRAM_URL}`,
      `fetch:${MINOR_URL}`,
    ]);
    expect(stubs.events).not.toContain("hash-check");
    expect(stubs.events).not.toContain("publish");

    resetStubs();
    await expect(
      syncBulletin({ fetcher: successfulFetcher(), db, now }),
    ).resolves.toMatchObject({ outcome: "published" });
  });

  it("records a validation failure without inspecting or activating the catalog", async () => {
    resetStubs();
    stubs.report = {
      ...validReport,
      errors: [{ code: "empty-catalog" }],
    };
    stubs.publish.mockRejectedValueOnce(new Error("validation failed"));

    await expect(
      syncBulletin({ fetcher: successfulFetcher(), db, now }),
    ).rejects.toThrow("validation failed");

    expect(stubs.events).toContain("validate");
    expect(stubs.events).not.toContain("hash-check");
    expect(stubs.publish).toHaveBeenCalledWith(db, candidate, stubs.report);
  });

  it("publishes a validated changed candidate and returns safe counts", async () => {
    resetStubs();

    const result = await syncBulletin({
      fetcher: successfulFetcher(),
      db,
      now,
    });

    expect(stubs.publish).toHaveBeenCalledWith(db, candidate, validReport);
    expect(result).toMatchObject({
      outcome: "published",
      snapshotId: candidate.snapshotId,
      documentCount: 4,
      courseCount: 1,
      programCount: 3,
    });
  });

  it("rejects a second run while one synchronization is in progress", async () => {
    resetStubs();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetcher = vi.fn(async (url: string) => {
      stubs.events.push(`fetch:${url}`);
      if (url === PROGRAM_URL) await blocked;
      return "fixture html";
    });
    const first = syncBulletin({ fetcher, db, now });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledWith(PROGRAM_URL));

    const rejectedFetcher = successfulFetcher();
    await expect(syncBulletin({ fetcher: rejectedFetcher, db, now })).rejects.toBeInstanceOf(
      BulletinSyncInProgressError,
    );
    expect(rejectedFetcher).not.toHaveBeenCalled();

    release();
    await first;

    resetStubs();
    const retryFetcher = successfulFetcher();
    await expect(syncBulletin({ fetcher: retryFetcher, db, now })).resolves.toMatchObject({
      outcome: "published",
    });
    expect(retryFetcher).toHaveBeenCalled();
  });

  it("atomically coordinates lock ownership through the shared database", async () => {
    const firstOwner = "owner-first";
    const secondOwner = "owner-second";

    await expect(
      acquireBulletinSyncLock(db, firstOwner, now()),
    ).resolves.toBeUndefined();
    await expect(
      acquireBulletinSyncLock(db, secondOwner, now()),
    ).rejects.toBeInstanceOf(BulletinSyncInProgressError);

    await releaseBulletinSyncLock(db, secondOwner);
    await expect(
      acquireBulletinSyncLock(db, secondOwner, now()),
    ).rejects.toBeInstanceOf(BulletinSyncInProgressError);

    await releaseBulletinSyncLock(db, firstOwner);
    await expect(
      acquireBulletinSyncLock(db, secondOwner, now()),
    ).resolves.toBeUndefined();
    await releaseBulletinSyncLock(db, secondOwner);
  });

  it("releases the synchronization lock when the injected clock throws", async () => {
    resetStubs();
    const brokenNow = vi.fn(() => {
      throw new Error("clock failed");
    });

    await expect(
      syncBulletin({ fetcher: successfulFetcher(), db, now: brokenNow }),
    ).rejects.toThrow("clock failed");

    await expect(
      syncBulletin({ fetcher: successfulFetcher(), db, now }),
    ).resolves.toMatchObject({ outcome: "published" });
  });
});

describe("requireAdmin", () => {
  it.each([
    [null, { error: "unauthorized", status: 401 }],
    [{ user: {} }, { error: "unauthorized", status: 401 }],
    [
      { user: { id: "student", role: "student" as const } },
      { error: "forbidden", status: 403 },
    ],
    [
      { user: { id: "admin", role: "admin" as const } },
      { ok: true },
    ],
  ])("preserves the current 401/403 contract", async (session, expected) => {
    stubs.session = session;

    await expect(requireAdmin()).resolves.toEqual(expected);
  });
});
