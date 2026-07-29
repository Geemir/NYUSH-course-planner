import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireAdminUser } from "@/lib/adminAuth";
import {
  AnnouncementConflictError,
  AnnouncementNotFoundError,
  archiveAnnouncement,
  publishAnnouncement,
  updateDraft,
} from "@/lib/announcements/repository";
import { AnnouncementActionSchema } from "@/lib/announcements/types";

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/admin/announcements/[id]">,
) {
  const gate = await requireAdminUser();
  if (!("ok" in gate)) return json({ error: gate.error }, gate.status);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = AnnouncementActionSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_action" }, 422);

  try {
    const { id } = await context.params;
    const result = parsed.data.action === "update"
      ? await updateDraft(db, id, parsed.data.announcement)
      : parsed.data.action === "publish"
        ? await publishAnnouncement(db, id)
        : await archiveAnnouncement(db, id);
    return json(result);
  } catch (error) {
    if (error instanceof AnnouncementNotFoundError) {
      return json({ error: "announcement_not_found" }, 404);
    }
    if (error instanceof AnnouncementConflictError) {
      return json({ error: "announcement_conflict" }, 409);
    }
    return json({ error: "internal_error" }, 500);
  }
}
