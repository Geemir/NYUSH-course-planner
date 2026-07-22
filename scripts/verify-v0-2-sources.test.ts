import { describe, expect, it } from "vitest";
import { CATALOG_SOURCES } from "../src/lib/bulletin/sourceRegistry";
import { evaluateSourceVerification, type SourceVerificationRow } from "./verify-v0-2-sources";

const rows = (): SourceVerificationRow[] => CATALOG_SOURCES.map((source, index) => ({ sourceId: source.id, snapshotId: `snapshot-${index}`, status: "healthy", documentCount: 1, courseCount: 10, quarantinedCount: 0, sourceHash: `hash-${index}`, diagnosticCodes: [] }));

describe("v0.2 source verification", () => {
  it("accepts exact 14-source membership with Shanghai-only programs", () => {
    expect(evaluateSourceVerification(rows(), { activeReleaseId: "release", shanghaiProgramCount: 2, newYorkProgramCount: 0, nonUndergraduateCount: 0 }).ok).toBe(true);
  });

  it.each([
    ["missing source", rows().slice(1)],
    ["failed source", rows().map((row, index) => index === 1 ? { ...row, status: "failed" as const } : row)],
    ["zero source", rows().map((row, index) => index === 1 ? { ...row, courseCount: 0 } : row)],
  ])("rejects %s", (_label, input) => {
    expect(evaluateSourceVerification(input, { activeReleaseId: "release", shanghaiProgramCount: 2, newYorkProgramCount: 0, nonUndergraduateCount: 0 }).ok).toBe(false);
  });

  it("reports retained last-known-good as acceptable", () => {
    const input = rows(); input[1].status = "retained";
    expect(evaluateSourceVerification(input, { activeReleaseId: "release", shanghaiProgramCount: 1, newYorkProgramCount: 0, nonUndergraduateCount: 0 }).ok).toBe(true);
  });

  it("rejects New York programs and non-undergraduate publication", () => {
    const report = evaluateSourceVerification(rows(), { activeReleaseId: "release", shanghaiProgramCount: 1, newYorkProgramCount: 1, nonUndergraduateCount: 1 });
    expect(report.errors).toEqual(expect.arrayContaining([expect.stringContaining("New York"), expect.stringContaining("Graduate")]));
  });
});
