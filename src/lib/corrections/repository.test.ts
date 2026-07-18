import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { addUserMessage, applyCorrectionOverlay, CorrectionConflictError, createCorrection, listNotifications, listUserCorrections, markNotificationsRead, mergeDuplicateCorrection, readAdminCorrection, readUserCorrection, transitionCorrection, withdrawCorrection } from "@/lib/corrections/repository";
import type { CreateCorrectionRequest } from "@/lib/corrections/types";
import type { Db } from "@/lib/repository";

let db: Db;
let student: string;
let other: string;
let admin: string;

const report = (stableId = "stern:TEST-UA 1"): CreateCorrectionRequest => ({
  target: { kind: "course", stableId }, issueType: "incorrect_course_information", catalogReleaseId: "release-1",
  context: { sourceId: "stern", sourceSnapshotId: "snapshot-1", sourceUrl: "https://bulletins.nyu.edu/" },
  title: "Wrong Bulletin description", description: "The description shown in the planner does not match the current Bulletin page.",
  suggestedCorrection: "Use the linked Bulletin description.", evidenceUrl: "https://bulletins.nyu.edu/evidence",
});

beforeAll(async () => {
  db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const rows = await db.insert(schema.users).values([
    { email: "student@nyu.edu" }, { email: "other@nyu.edu" }, { email: "admin@nyu.edu", role: "admin" },
  ]).returning();
  [student, other, admin] = rows.map((row) => row.id);
});

describe("correction repository", () => {
  it("creates an owner-scoped report with an immutable initial event", async () => {
    const created = await createCorrection(db, student, report());
    expect(created.status).toBe("submitted");
    expect(created.events.map((event) => event.eventType)).toEqual(["submitted"]);
    expect((await listUserCorrections(db, student)).items.some((item) => item.id === created.id)).toBe(true);
    expect(await readUserCorrection(db, other, created.id)).toBeNull();
  });

  it("keeps internal messages and private review notes out of student detail", async () => {
    const created = await createCorrection(db, student, report("stern:PRIVATE 1"));
    await addUserMessage(db, student, created.id, "Student-provided clarification");
    await transitionCorrection(db, admin, created.id, { toStatus: "in_review", privateNote: "Reviewer-only context", assignToSelf: true });
    await db.insert(schema.correctionMessage).values({ requestId: created.id, authorUserId: admin, visibility: "internal", body: "Internal discussion" });
    const owner = await readUserCorrection(db, student, created.id);
    const reviewer = await readAdminCorrection(db, created.id);
    expect(owner?.messages.map((message) => message.body)).toEqual(["Student-provided clarification"]);
    expect(JSON.stringify(owner)).not.toContain("Reviewer-only context");
    expect(reviewer?.privateEvents.some((event) => event.privateNote === "Reviewer-only context")).toBe(true);
  });

  it("withdraws only eligible owner reports and records an event", async () => {
    const created = await createCorrection(db, student, report("stern:WITHDRAW 1"));
    const withdrawn = await withdrawCorrection(db, student, created.id);
    expect(withdrawn.withdrawnAt).not.toBeNull();
    expect(withdrawn.events.at(-1)?.eventType).toBe("withdrawn");
    await expect(withdrawCorrection(db, student, created.id)).rejects.toBeInstanceOf(CorrectionConflictError);
  });

  it("transitions, applies once, and atomically notifies with an overlay event", async () => {
    const created = await createCorrection(db, student, report("stern:APPLY 1"));
    await transitionCorrection(db, admin, created.id, { toStatus: "in_review", assignToSelf: true });
    await transitionCorrection(db, admin, created.id, { toStatus: "approved", publicNote: "Verified against the Bulletin." });
    const applied = await applyCorrectionOverlay(db, admin, created.id, { kind: "course", stableId: "stern:APPLY 1", changes: { description: "Reviewed description" } }, "release-1");
    expect(applied.request.status).toBe("applied");
    expect(applied.request.events.at(-1)?.eventType).toBe("overlay_applied");
    await expect(applyCorrectionOverlay(db, admin, created.id, { kind: "course", stableId: "stern:APPLY 1", changes: { title: "Again" } }, "release-1")).rejects.toBeInstanceOf(CorrectionConflictError);
    const notifications = await listNotifications(db, student);
    expect(notifications.some((item) => item.kind === "correction_applied")).toBe(true);
    const read = await markNotificationsRead(db, student, { ids: [notifications[0].id] });
    expect(read[0].readAt).not.toBeNull();
    expect(await markNotificationsRead(db, other, { ids: [notifications[0].id] })).toHaveLength(0);
  });

  it("merges only compatible reports without exposing the canonical owner", async () => {
    const duplicate = await createCorrection(db, student, report("stern:DUP 1"));
    const canonical = await createCorrection(db, other, report("stern:DUP 1"));
    const merged = await mergeDuplicateCorrection(db, admin, duplicate.id, canonical.id, "This matches another open report for the same course.");
    expect(merged.duplicateOfId).toBe(canonical.id);
    expect(merged.status).toBe("rejected");
    const owner = await readUserCorrection(db, student, duplicate.id);
    expect(JSON.stringify(owner)).not.toContain(other);
    const events = await db.select().from(schema.correctionEvent).where(eq(schema.correctionEvent.requestId, duplicate.id));
    expect(events.at(-1)?.eventType).toBe("merged_duplicate");
  });
});
