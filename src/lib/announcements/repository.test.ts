import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  AnnouncementConflictError,
  archiveAnnouncement,
  createDraft,
  getCurrentAnnouncement,
  listAnnouncements,
  publishAnnouncement,
  updateDraft,
} from "@/lib/announcements/repository";
import type { Db } from "@/lib/repository";

let db: Db;
let adminId: string;

const input = (title: string, expiresAt: string | null = null) => ({
  title,
  body: `${title} body`,
  tone: "info" as const,
  linkUrl: null,
  linkLabel: null,
  expiresAt,
});

beforeAll(async () => {
  const client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [admin] = await db.insert(schema.users).values({
    email: "announcements-admin@nyu.edu",
    role: "admin",
  }).returning({ id: schema.users.id });
  adminId = admin.id;
});

describe("announcement repository", () => {
  it("keeps drafts private, then publishes and withdraws one current notice", async () => {
    const draft = await createDraft(db, input("First"), adminId, new Date("2026-07-29T00:00:00.000Z"));
    expect(await getCurrentAnnouncement(db, new Date("2026-07-29T00:01:00.000Z"))).toBeNull();

    const published = await publishAnnouncement(db, draft.id, new Date("2026-07-29T00:02:00.000Z"));
    expect(published.status).toBe("published");
    expect(await getCurrentAnnouncement(db, new Date("2026-07-29T00:03:00.000Z"))).toMatchObject({
      id: draft.id,
      title: "First",
    });

    const archived = await archiveAnnouncement(db, draft.id, new Date("2026-07-29T00:04:00.000Z"));
    expect(archived.status).toBe("archived");
    expect(await getCurrentAnnouncement(db, new Date("2026-07-29T00:05:00.000Z"))).toBeNull();
  });

  it("archives the previous publication transactionally", async () => {
    const first = await createDraft(db, input("Current A"), adminId, new Date("2026-07-29T01:00:00.000Z"));
    await publishAnnouncement(db, first.id, new Date("2026-07-29T01:01:00.000Z"));
    const second = await createDraft(db, input("Current B"), adminId, new Date("2026-07-29T01:02:00.000Z"));
    await publishAnnouncement(db, second.id, new Date("2026-07-29T01:03:00.000Z"));

    expect(await getCurrentAnnouncement(db, new Date("2026-07-29T01:04:00.000Z"))).toMatchObject({ id: second.id, title: "Current B" });
    const history = await listAnnouncements(db);
    expect(history.find(({ id }) => id === first.id)?.status).toBe("archived");
    expect(history.findIndex(({ id }) => id === second.id)).toBeLessThan(history.findIndex(({ id }) => id === first.id));
  });

  it("excludes expired publications from the public query", async () => {
    const draft = await createDraft(db, input("Expires", "2099-01-02T00:00:00.000Z"), adminId);
    await publishAnnouncement(db, draft.id, new Date("2099-01-01T00:00:00.000Z"));

    expect(await getCurrentAnnouncement(db, new Date("2099-01-03T00:00:00.000Z"))).toBeNull();
  });

  it("allows editing drafts but rejects edits after publication", async () => {
    const draft = await createDraft(db, input("Editable"), adminId);
    expect(await updateDraft(db, draft.id, input("Edited"))).toMatchObject({ title: "Edited" });
    await publishAnnouncement(db, draft.id);

    await expect(updateDraft(db, draft.id, input("Too late"))).rejects.toBeInstanceOf(AnnouncementConflictError);
  });

  it("never exposes the actor in the public DTO", async () => {
    const draft = await createDraft(db, input("Public safe"), adminId);
    await publishAnnouncement(db, draft.id);
    const current = await getCurrentAnnouncement(db);

    expect(current).not.toHaveProperty("createdBy");
    expect(current).not.toHaveProperty("createdAt");
  });
});
