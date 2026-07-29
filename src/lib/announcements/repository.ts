import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { announcements } from "@/db/schema";
import {
  AnnouncementInputSchema,
  AnnouncementSchema,
  toPublicAnnouncement,
  type Announcement,
  type AnnouncementInput,
  type PublicAnnouncement,
} from "@/lib/announcements/types";
import type { Db } from "@/lib/repository";

type TransactionRunner = {
  transaction<T>(operation: (tx: Db) => Promise<T>): Promise<T>;
};

export class AnnouncementNotFoundError extends Error {
  constructor(readonly id: string) {
    super("Announcement not found.");
    this.name = "AnnouncementNotFoundError";
  }
}

export class AnnouncementConflictError extends Error {
  constructor(message = "Announcement lifecycle changed. Reload and try again.") {
    super(message);
    this.name = "AnnouncementConflictError";
  }
}

function transaction<T>(db: Db, operation: (tx: Db) => Promise<T>): Promise<T> {
  return (db as unknown as TransactionRunner).transaction(operation);
}

function asAnnouncement(row: typeof announcements.$inferSelect): Announcement {
  return AnnouncementSchema.parse({
    ...row,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function persistedInput(input: AnnouncementInput) {
  const parsed = AnnouncementInputSchema.parse(input);
  return {
    title: parsed.title,
    body: parsed.body,
    tone: parsed.tone,
    linkUrl: parsed.linkUrl,
    linkLabel: parsed.linkLabel,
    expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
  };
}

export async function createDraft(
  db: Db,
  input: AnnouncementInput,
  createdBy: string,
  now: Date = new Date(),
): Promise<Announcement> {
  const [row] = await db.insert(announcements).values({
    ...persistedInput(input),
    createdBy,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  }).returning();
  return asAnnouncement(row);
}

export async function updateDraft(
  db: Db,
  id: string,
  input: AnnouncementInput,
  now: Date = new Date(),
): Promise<Announcement> {
  const [existing] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
  if (!existing) throw new AnnouncementNotFoundError(id);
  if (existing.status !== "draft") throw new AnnouncementConflictError("Only draft announcements can be edited.");
  const [row] = await db.update(announcements).set({
    ...persistedInput(input),
    updatedAt: now,
  }).where(and(eq(announcements.id, id), eq(announcements.status, "draft"))).returning();
  if (!row) throw new AnnouncementConflictError();
  return asAnnouncement(row);
}

export async function publishAnnouncement(
  db: Db,
  id: string,
  now: Date = new Date(),
): Promise<Announcement> {
  return transaction(db, async (tx) => {
    const [target] = await tx.select().from(announcements)
      .where(eq(announcements.id, id)).limit(1).for("update");
    if (!target) throw new AnnouncementNotFoundError(id);
    if (target.status !== "draft") throw new AnnouncementConflictError("Only draft announcements can be published.");

    await tx.update(announcements).set({ status: "archived", updatedAt: now })
      .where(eq(announcements.status, "published"));
    const [row] = await tx.update(announcements).set({
      status: "published",
      publishedAt: now,
      updatedAt: now,
    }).where(and(eq(announcements.id, id), eq(announcements.status, "draft"))).returning();
    if (!row) throw new AnnouncementConflictError();
    return asAnnouncement(row);
  });
}

export async function archiveAnnouncement(
  db: Db,
  id: string,
  now: Date = new Date(),
): Promise<Announcement> {
  const [existing] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
  if (!existing) throw new AnnouncementNotFoundError(id);
  if (existing.status === "archived") throw new AnnouncementConflictError("Announcement is already archived.");
  const [row] = await db.update(announcements).set({ status: "archived", updatedAt: now })
    .where(and(eq(announcements.id, id), eq(announcements.status, existing.status)))
    .returning();
  if (!row) throw new AnnouncementConflictError();
  return asAnnouncement(row);
}

export async function listAnnouncements(db: Db): Promise<Announcement[]> {
  const rows = await db.select().from(announcements)
    .orderBy(desc(announcements.createdAt), desc(announcements.id));
  return rows.map(asAnnouncement);
}

export async function getCurrentAnnouncement(
  db: Db,
  now: Date = new Date(),
): Promise<PublicAnnouncement | null> {
  const [row] = await db.select().from(announcements).where(and(
    eq(announcements.status, "published"),
    or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now)),
  )).limit(1);
  if (!row) return null;
  return toPublicAnnouncement(asAnnouncement(row));
}
