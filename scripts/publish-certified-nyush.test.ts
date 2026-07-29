import { describe, expect, it } from "vitest";
import { requirePublishableReport, requireStableActiveRelease, resultingReleaseId } from "./publish-certified-nyush";
import type { CertificationArtifact } from "./certify-nyush-programs";

const report = { status: "pass", programCount: 43, passed: 43, failed: 0, programs: [], candidateHash: "hash", candidateSnapshotId: "snapshot", candidatePath: "candidate.json", expectedActiveReleaseId: "release-a", createdAt: "2026-07-29T00:00:00.000Z" } satisfies CertificationArtifact;

describe("certified NYUSH publisher guards", () => {
  it("rejects stale candidates and changed releases", () => {
    expect(() => requirePublishableReport(report, { sourceHash: "stale", snapshotId: "snapshot" })).toThrow(/hash/i);
    expect(() => requireStableActiveRelease("release-a", "release-b")).toThrow(/changed/i);
  });
  it("accepts the exact certified candidate and active pointer", () => {
    expect(() => requirePublishableReport(report, { sourceHash: "hash", snapshotId: "snapshot" })).not.toThrow();
    expect(() => requireStableActiveRelease("release-a", "release-a")).not.toThrow();
  });
  it("derives one deterministic release ID from sorted source memberships", () => {
    expect(resultingReleaseId({ b: "2", a: "1" })).toBe(
      resultingReleaseId({ a: "1", b: "2" }),
    );
    expect(resultingReleaseId({ a: "1", b: "3" })).not.toBe(
      resultingReleaseId({ a: "1", b: "2" }),
    );
  });
});
