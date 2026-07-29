import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { CorrectionOverlayInputSchema, assertCorrectionTransition, canStudentWithdraw, type CorrectionOverlayInput } from "@/lib/corrections/policy";
import { CreateCorrectionRequestSchema, type AdminCorrectionDetail, type CorrectionEventDto, type CorrectionMessageDto, type CorrectionStatus, type CreateCorrectionRequest, type StudentCorrectionDetail, type StudentCorrectionSummary } from "@/lib/corrections/types";
import type { Db } from "@/lib/repository";

type TransactionRunner = { transaction<T>(operation: (tx: Db) => Promise<T>): Promise<T> };
const transact = <T>(db: Db, operation: (tx: Db) => Promise<T>) => (db as unknown as TransactionRunner).transaction(operation);

export class CorrectionNotFoundError extends Error {}
export class CorrectionConflictError extends Error {}

const iso = (value: Date) => value.toISOString();

function summary(row: typeof schema.correctionRequest.$inferSelect): StudentCorrectionSummary {
  return { id: row.id, target: row.targetData, issueType: row.issueType, title: row.title, status: row.status, withdrawnAt: row.withdrawnAt ? iso(row.withdrawnAt) : null, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}

function messageDto(row: typeof schema.correctionMessage.$inferSelect, ownerId: string): CorrectionMessageDto {
  return { id: row.id, body: row.body, author: row.authorUserId === ownerId ? "student" : "maintainer", createdAt: iso(row.createdAt) };
}

function eventDto(row: typeof schema.correctionEvent.$inferSelect): CorrectionEventDto {
  return { id: row.id, eventType: row.eventType, fromStatus: row.fromStatus, toStatus: row.toStatus, publicNote: row.publicNote, createdAt: iso(row.createdAt) };
}

async function detailFromRow(db: Db, row: typeof schema.correctionRequest.$inferSelect, admin = false): Promise<StudentCorrectionDetail | AdminCorrectionDetail> {
  const messages = await db.select().from(schema.correctionMessage).where(admin ? eq(schema.correctionMessage.requestId, row.id) : and(eq(schema.correctionMessage.requestId, row.id), eq(schema.correctionMessage.visibility, "public"))).orderBy(schema.correctionMessage.createdAt);
  const events = await db.select().from(schema.correctionEvent).where(eq(schema.correctionEvent.requestId, row.id)).orderBy(schema.correctionEvent.createdAt);
  const base: StudentCorrectionDetail = { ...summary(row), catalogReleaseId: row.catalogReleaseId, context: row.contextData, description: row.description, suggestedCorrection: row.suggestedCorrection, evidenceUrl: row.evidenceUrl, messages: messages.map((item) => messageDto(item, row.userId)), events: events.map(eventDto) };
  if (!admin) return base;
  return { ...base, ownerUserId: row.userId, assignedTo: row.assignedTo, duplicateOfId: row.duplicateOfId, privateEvents: events.map((event) => ({ ...eventDto(event), privateNote: event.privateNote, actorUserId: event.actorUserId })) };
}

export async function createCorrection(db: Db, userId: string, raw: CreateCorrectionRequest): Promise<StudentCorrectionDetail> {
  const input = CreateCorrectionRequestSchema.parse(raw);
  return transact(db, async (tx) => {
    const [row] = await tx.insert(schema.correctionRequest).values({ userId, targetKind: input.target.kind, targetData: input.target, issueType: input.issueType, catalogReleaseId: input.catalogReleaseId, contextData: input.context, title: input.title, description: input.description, suggestedCorrection: input.suggestedCorrection ?? null, evidenceUrl: input.evidenceUrl ?? null }).returning();
    await tx.insert(schema.correctionEvent).values({ requestId: row.id, actorUserId: userId, eventType: "submitted", toStatus: "submitted", publicNote: "Report submitted." });
    return detailFromRow(tx, row) as Promise<StudentCorrectionDetail>;
  });
}

export interface CorrectionPage { items: StudentCorrectionSummary[]; nextCursor: string | null }
export async function listUserCorrections(db: Db, userId: string, query: { status?: CorrectionStatus; cursor?: string; limit?: number } = {}): Promise<CorrectionPage> {
  const limit = Math.min(50, Math.max(1, query.limit ?? 20));
  const cursor = query.cursor ? new Date(query.cursor) : null;
  const where = and(eq(schema.correctionRequest.userId, userId), query.status ? eq(schema.correctionRequest.status, query.status) : undefined, cursor ? lt(schema.correctionRequest.updatedAt, cursor) : undefined);
  const rows = await db.select().from(schema.correctionRequest).where(where).orderBy(desc(schema.correctionRequest.updatedAt)).limit(limit + 1);
  return { items: rows.slice(0, limit).map(summary), nextCursor: rows.length > limit ? iso(rows[limit - 1].updatedAt) : null };
}

export async function readUserCorrection(db: Db, userId: string, requestId: string): Promise<StudentCorrectionDetail | null> {
  const [row] = await db.select().from(schema.correctionRequest).where(and(eq(schema.correctionRequest.id, requestId), eq(schema.correctionRequest.userId, userId))).limit(1);
  return row ? detailFromRow(db, row) as Promise<StudentCorrectionDetail> : null;
}

export async function addUserMessage(db: Db, userId: string, requestId: string, body: string): Promise<CorrectionMessageDto> {
  const text = body.trim();
  if (!text || text.length > 4000) throw new CorrectionConflictError("Invalid message.");
  return transact(db, async (tx) => {
    const [request] = await tx.select().from(schema.correctionRequest).where(and(eq(schema.correctionRequest.id, requestId), eq(schema.correctionRequest.userId, userId))).limit(1);
    if (!request) throw new CorrectionNotFoundError();
    if (request.withdrawnAt || request.status === "applied" || request.status === "rejected") throw new CorrectionConflictError("This report is closed.");
    const [row] = await tx.insert(schema.correctionMessage).values({ requestId, authorUserId: userId, visibility: "public", body: text }).returning();
    await tx.insert(schema.correctionEvent).values({ requestId, actorUserId: userId, eventType: "student_message", metadata: { messageId: row.id } });
    return messageDto(row, userId);
  });
}

export async function withdrawCorrection(db: Db, userId: string, requestId: string): Promise<StudentCorrectionDetail> {
  return transact(db, async (tx) => {
    const [row] = await tx.select().from(schema.correctionRequest).where(and(eq(schema.correctionRequest.id, requestId), eq(schema.correctionRequest.userId, userId))).limit(1);
    if (!row) throw new CorrectionNotFoundError();
    if (!canStudentWithdraw(row.status, row.withdrawnAt)) throw new CorrectionConflictError("This report cannot be withdrawn.");
    const now = new Date();
    const [updated] = await tx.update(schema.correctionRequest).set({ withdrawnAt: now, closedAt: now, updatedAt: now }).where(eq(schema.correctionRequest.id, requestId)).returning();
    await tx.insert(schema.correctionEvent).values({ requestId, actorUserId: userId, eventType: "withdrawn", fromStatus: row.status, toStatus: row.status, publicNote: "Report withdrawn by student." });
    return detailFromRow(tx, updated) as Promise<StudentCorrectionDetail>;
  });
}

export interface AdminCorrectionPage { items: AdminCorrectionDetail[]; counts: Partial<Record<CorrectionStatus, number>>; nextCursor: string | null }
export async function listAdminCorrections(db: Db, query: { status?: CorrectionStatus; targetKind?: string; issueType?: string; q?: string; assignedTo?: string | null; cursor?: string; limit?: number } = {}): Promise<AdminCorrectionPage> {
  const limit = Math.min(50, Math.max(1, query.limit ?? 20));
  const cursor = query.cursor ? new Date(query.cursor) : null;
  const where = and(query.status ? eq(schema.correctionRequest.status, query.status) : undefined, query.targetKind ? eq(schema.correctionRequest.targetKind, query.targetKind) : undefined, query.issueType ? eq(schema.correctionRequest.issueType, query.issueType as typeof schema.correctionRequest.$inferSelect.issueType) : undefined, query.assignedTo === null ? isNull(schema.correctionRequest.assignedTo) : query.assignedTo ? eq(schema.correctionRequest.assignedTo, query.assignedTo) : undefined, query.q ? or(sql`${schema.correctionRequest.title} ilike ${`%${query.q}%`}`, sql`${schema.correctionRequest.description} ilike ${`%${query.q}%`}`) : undefined, cursor ? lt(schema.correctionRequest.updatedAt, cursor) : undefined);
  const rows = await db.select().from(schema.correctionRequest).where(where).orderBy(desc(schema.correctionRequest.updatedAt)).limit(limit + 1);
  const countRows = await db.select({ status: schema.correctionRequest.status, count: sql<number>`count(*)::int` }).from(schema.correctionRequest).groupBy(schema.correctionRequest.status);
  const items = await Promise.all(rows.slice(0, limit).map((row) => detailFromRow(db, row, true) as Promise<AdminCorrectionDetail>));
  return { items, counts: Object.fromEntries(countRows.map((row) => [row.status, row.count])), nextCursor: rows.length > limit ? iso(rows[limit - 1].updatedAt) : null };
}

export async function readAdminCorrection(db: Db, requestId: string): Promise<AdminCorrectionDetail | null> {
  const [row] = await db.select().from(schema.correctionRequest).where(eq(schema.correctionRequest.id, requestId)).limit(1);
  return row ? detailFromRow(db, row, true) as Promise<AdminCorrectionDetail> : null;
}

async function notify(tx: Db, row: typeof schema.correctionRequest.$inferSelect, kind: string, title: string, body: string) {
  await tx.insert(schema.notification).values({ userId: row.userId, requestId: row.id, kind, title, body });
}

export async function transitionCorrection(db: Db, adminId: string, requestId: string, input: { toStatus: Exclude<CorrectionStatus, "submitted" | "applied">; publicNote?: string; privateNote?: string; assignToSelf?: boolean }): Promise<AdminCorrectionDetail> {
  return transact(db, async (tx) => {
    const [row] = await tx.select().from(schema.correctionRequest).where(eq(schema.correctionRequest.id, requestId)).limit(1);
    if (!row) throw new CorrectionNotFoundError();
    if (row.withdrawnAt) throw new CorrectionConflictError("Report was withdrawn.");
    assertCorrectionTransition(row.status, input.toStatus, input.publicNote);
    const now = new Date();
    const [updated] = await tx.update(schema.correctionRequest).set({ status: input.toStatus, assignedTo: input.assignToSelf ? adminId : row.assignedTo, updatedAt: now, closedAt: input.toStatus === "rejected" ? now : null }).where(eq(schema.correctionRequest.id, requestId)).returning();
    await tx.insert(schema.correctionEvent).values({ requestId, actorUserId: adminId, eventType: "status_changed", fromStatus: row.status, toStatus: input.toStatus, publicNote: input.publicNote ?? null, privateNote: input.privateNote ?? null });
    await notify(tx, updated, "correction_status", `Report ${input.toStatus.replaceAll("_", " ")}`, input.publicNote?.trim() || "Your report status changed.");
    return detailFromRow(tx, updated, true) as Promise<AdminCorrectionDetail>;
  });
}

function targetKey(target: typeof schema.correctionRequest.$inferSelect.targetData): string {
  if (target.kind === "course") return target.stableId;
  if (target.kind === "requirement") return `${target.programId}:${target.requirementId}`;
  if (target.kind === "program") return target.programId;
  return `other:${target.area}`;
}

export async function mergeDuplicateCorrection(db: Db, adminId: string, requestId: string, canonicalRequestId: string, publicNote: string): Promise<AdminCorrectionDetail> {
  if (requestId === canonicalRequestId) throw new CorrectionConflictError("A report cannot merge into itself.");
  return transact(db, async (tx) => {
    const rows = await tx.select().from(schema.correctionRequest).where(inArray(schema.correctionRequest.id, [requestId, canonicalRequestId]));
    const duplicate = rows.find((row) => row.id === requestId);
    const canonical = rows.find((row) => row.id === canonicalRequestId);
    if (!duplicate || !canonical) throw new CorrectionNotFoundError();
    if (targetKey(duplicate.targetData) !== targetKey(canonical.targetData) || canonical.duplicateOfId || canonical.withdrawnAt || ["rejected", "applied"].includes(canonical.status)) throw new CorrectionConflictError("Reports are not compatible for merge.");
    const now = new Date();
    const [updated] = await tx.update(schema.correctionRequest).set({ status: "rejected", duplicateOfId: canonical.id, closedAt: now, updatedAt: now }).where(eq(schema.correctionRequest.id, duplicate.id)).returning();
    await tx.insert(schema.correctionEvent).values({ requestId, actorUserId: adminId, eventType: "merged_duplicate", fromStatus: duplicate.status, toStatus: "rejected", publicNote, metadata: { canonicalTarget: targetKey(canonical.targetData) } });
    await notify(tx, updated, "correction_merged", "Report merged with a related issue", publicNote);
    return detailFromRow(tx, updated, true) as Promise<AdminCorrectionDetail>;
  });
}

export interface AppliedOverlayResult { request: AdminCorrectionDetail; overlay: typeof schema.catalogOverlay.$inferSelect }
export async function applyCorrectionOverlay(db: Db, adminId: string, requestId: string, raw: CorrectionOverlayInput, sourceReleaseId: string | null): Promise<AppliedOverlayResult> {
  const input = CorrectionOverlayInputSchema.parse(raw);
  return transact(db, async (tx) => {
    const [row] = await tx.select().from(schema.correctionRequest).where(eq(schema.correctionRequest.id, requestId)).limit(1);
    if (!row) throw new CorrectionNotFoundError();
    if (row.status !== "approved") throw new CorrectionConflictError("Only approved reports can be applied.");
    const inputKey = input.kind === "course" || input.kind === "course-delete"
      ? input.stableId
      : input.kind === "requirement"
        ? `${input.programId}:${input.requirementId}`
        : input.kind === "requirement-upsert"
          ? `${input.programId}:${input.category.id}`
          : input.kind === "requirement-delete"
            ? `${input.programId}:${input.categoryId}`
            : input.kind === "program-note"
              ? input.programId
              : input.program.id;
    if (targetKey(row.targetData) !== inputKey) throw new CorrectionConflictError("Overlay target does not match the reviewed report.");
    const existing = await tx.select({ id: schema.catalogOverlay.id }).from(schema.catalogOverlay).where(eq(schema.catalogOverlay.requestId, requestId)).limit(1);
    if (existing.length) throw new CorrectionConflictError("This report was already applied.");
    const [overlay] = await tx.insert(schema.catalogOverlay).values({ requestId, targetKind: input.kind, targetKey: inputKey, patchType: input.kind, patchData: input, sourceReleaseId, appliedBy: adminId }).returning();
    const now = new Date();
    const [updated] = await tx.update(schema.correctionRequest).set({ status: "applied", closedAt: now, updatedAt: now }).where(eq(schema.correctionRequest.id, requestId)).returning();
    await tx.insert(schema.correctionEvent).values({ requestId, actorUserId: adminId, eventType: "overlay_applied", fromStatus: "approved", toStatus: "applied", publicNote: "Reviewed correction applied to the planner.", metadata: { overlayId: overlay.id } });
    await notify(tx, updated, "correction_applied", "Correction applied", "The reviewed correction is now reflected in the planner.");
    return { request: await detailFromRow(tx, updated, true) as AdminCorrectionDetail, overlay };
  });
}

export async function listNotifications(db: Db, userId: string, limit = 20) {
  return db.select().from(schema.notification).where(eq(schema.notification.userId, userId)).orderBy(desc(schema.notification.createdAt)).limit(Math.min(50, limit));
}

export async function markNotificationsRead(db: Db, userId: string, input: { ids?: string[]; all?: boolean }) {
  const where = input.all ? eq(schema.notification.userId, userId) : and(eq(schema.notification.userId, userId), inArray(schema.notification.id, (input.ids ?? []).slice(0, 100)));
  return db.update(schema.notification).set({ readAt: new Date() }).where(where).returning();
}
