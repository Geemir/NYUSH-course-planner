import { describe, expect, it } from "vitest";
import { assertDisposableMigrationTarget, runMigrationRehearsal } from "./rehearse-v0-2-migration";

describe("v0.2 migration rehearsal", () => {
  it("refuses unmarked and production-like targets", () => {
    expect(() => assertDisposableMigrationTarget({ allowed: false, target: "pglite://memory/test" })).toThrow(/ALLOW_DESTRUCTIVE/);
    expect(() => assertDisposableMigrationTarget({ allowed: true, target: "postgresql://db/production" })).toThrow(/production-like/);
    expect(() => assertDisposableMigrationTarget({ allowed: true, target: "postgresql://db/staging", productionTarget: "postgresql://db/staging" })).toThrow(/production-like/);
  });

  it("applies every migration and preserves legacy rows with revision defaults", async () => {
    const result = await runMigrationRehearsal();
    expect(result).toMatchObject({ ok: true, migrationCount: 11, userCount: 1, sessionCount: 1, planCount: 1, revision: 1, snapshotVersion: 1, correctionTablesPresent: true, announcementTablePresent: true, maintenanceAuditTablePresent: true, aboutTablePresent: true, translationTablePresent: true });
  });
});
