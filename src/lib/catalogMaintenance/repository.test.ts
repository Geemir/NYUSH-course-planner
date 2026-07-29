import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { applyDirectCatalogOverlay, listDirectCatalogOverlays, setCatalogOverlayActive } from "@/lib/catalogMaintenance/repository";

describe("direct catalog maintenance repository", () => {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
    await db.insert(schema.users).values({ id: "maintainer-1", email: "maintainer@nyu.edu", role: "admin" });
  });

  it("publishes, reverts, and restores an audited direct overlay", async () => {
    const created = await applyDirectCatalogOverlay(db, "maintainer-1", {
      patch: { kind: "course", stableId: "nyu-shanghai:TEST-SHU 1", changes: { prerequisiteText: "TEST-SHU 0" } },
      reason: "Bulletin prerequisite was updated.",
      sourceReleaseId: null,
    });
    expect(created).toMatchObject({ origin: "direct", requestId: null, status: "active", reason: "Bulletin prerequisite was updated." });

    await setCatalogOverlayActive(db, "maintainer-1", created.id, false, "Temporarily revert while checking the source.");
    await setCatalogOverlayActive(db, "maintainer-1", created.id, true, "Source verification completed.");

    const [listed] = await listDirectCatalogOverlays(db);
    expect(listed.overlay.status).toBe("active");
    expect(listed.events.map((event) => event.eventType)).toEqual(["created", "reverted", "restored"]);
    expect(listed.events.map((event) => event.reason)).toEqual([
      "Bulletin prerequisite was updated.",
      "Temporarily revert while checking the source.",
      "Source verification completed.",
    ]);
  });

  it("rejects empty reasons and invalid patches before writing", async () => {
    await expect(applyDirectCatalogOverlay(db, "maintainer-1", {
      patch: { kind: "course-delete", stableId: "nyu-shanghai:TEST-SHU 2" },
      reason: " ", sourceReleaseId: null,
    })).rejects.toThrow();
  });
});
