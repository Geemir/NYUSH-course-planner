import { db } from "@/db";
import { createBulletinFetch } from "@/lib/bulletin/fetch";
import { syncBulletin } from "@/lib/bulletin/sync";

const fetcher = createBulletinFetch({
  timeoutMs: 15_000,
  retries: 2,
  userAgent: "NYUSH Course Planner Bulletin Synchronizer",
});

try {
  const result = await syncBulletin({
    fetcher,
    db,
    now: () => new Date(),
  });
  console.log(
    `${result.outcome}: snapshot=${result.snapshotId} documents=${result.documentCount} courses=${result.courseCount} programs=${result.programCount}`,
  );
  process.exitCode = 0;
} catch {
  console.error("Bulletin synchronization failed.");
  process.exitCode = 1;
}
