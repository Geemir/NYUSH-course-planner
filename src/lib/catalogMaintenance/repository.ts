import { and, asc, desc, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { DirectCatalogOverlayInputSchema, type DirectCatalogOverlayInput } from "@/lib/catalogMaintenance/types";
import type { CorrectionOverlayInput } from "@/lib/corrections/policy";
import type { Db } from "@/lib/repository";

type TransactionRunner = { transaction<T>(operation: (tx: Db) => Promise<T>): Promise<T> };
const transact = <T>(db: Db, operation: (tx: Db) => Promise<T>) =>
  (db as unknown as TransactionRunner).transaction(operation);

export class CatalogMaintenanceNotFoundError extends Error {}

function targetKey(patch: CorrectionOverlayInput): string {
  if (patch.kind === "course" || patch.kind === "course-delete") return patch.stableId;
  if (patch.kind === "requirement") return `${patch.programId}:${patch.requirementId}`;
  if (patch.kind === "requirement-upsert") return `${patch.programId}:${patch.category.id}`;
  if (patch.kind === "requirement-delete") return `${patch.programId}:${patch.categoryId}`;
  if (patch.kind === "program-note") return patch.programId;
  return patch.program.id;
}

export async function applyDirectCatalogOverlay(
  db: Db,
  actorUserId: string,
  raw: DirectCatalogOverlayInput,
) {
  const input = DirectCatalogOverlayInputSchema.parse(raw);
  return transact(db, async (tx) => {
    const [overlay] = await tx.insert(schema.catalogOverlay).values({
      requestId: null,
      origin: "direct",
      reason: input.reason,
      targetKind: input.patch.kind,
      targetKey: targetKey(input.patch),
      patchType: input.patch.kind,
      patchData: input.patch,
      sourceReleaseId: input.sourceReleaseId,
      appliedBy: actorUserId,
    }).returning();
    await tx.insert(schema.catalogOverlayEvent).values({
      overlayId: overlay.id,
      actorUserId,
      eventType: "created",
      reason: input.reason,
      metadata: { patchKind: input.patch.kind },
    });
    return overlay;
  });
}

export async function setCatalogOverlayActive(
  db: Db,
  actorUserId: string,
  overlayId: string,
  active: boolean,
  rawReason: string,
) {
  const reason = DirectCatalogOverlayInputSchema.shape.reason.parse(rawReason);
  return transact(db, async (tx) => {
    const [existing] = await tx.select().from(schema.catalogOverlay).where(and(
      eq(schema.catalogOverlay.id, overlayId),
      eq(schema.catalogOverlay.origin, "direct"),
    )).limit(1);
    if (!existing) throw new CatalogMaintenanceNotFoundError("Direct catalog overlay not found.");
    const now = new Date();
    const [overlay] = await tx.update(schema.catalogOverlay).set({
      status: active ? "active" : "superseded",
      supersededAt: active ? null : now,
    }).where(eq(schema.catalogOverlay.id, overlayId)).returning();
    await tx.insert(schema.catalogOverlayEvent).values({
      overlayId,
      actorUserId,
      eventType: active ? "restored" : "reverted",
      reason,
    });
    return overlay;
  });
}

export async function listDirectCatalogOverlays(db: Db) {
  const overlays = await db.select().from(schema.catalogOverlay)
    .where(eq(schema.catalogOverlay.origin, "direct"))
    .orderBy(desc(schema.catalogOverlay.createdAt));
  if (!overlays.length) return [];
  const events = await db.select().from(schema.catalogOverlayEvent)
    .orderBy(asc(schema.catalogOverlayEvent.createdAt));
  return overlays.map((overlay) => ({
    overlay,
    events: events.filter((event) => event.overlayId === overlay.id),
  }));
}

