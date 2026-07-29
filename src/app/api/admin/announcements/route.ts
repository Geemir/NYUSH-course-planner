import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireAdminUser } from "@/lib/adminAuth";
import { createDraft, listAnnouncements } from "@/lib/announcements/repository";
import { AnnouncementInputSchema } from "@/lib/announcements/types";

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

export async function GET() {
  const gate = await requireAdminUser();
  if (!("ok" in gate)) return json({ error: gate.error }, gate.status);
  try {
    return json({ items: await listAnnouncements(db) });
  } catch {
    return json({ error: "internal_error" }, 500);
  }
}

export async function POST(request: Request) {
  const gate = await requireAdminUser();
  if (!("ok" in gate)) return json({ error: gate.error }, gate.status);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = AnnouncementInputSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_announcement" }, 422);
  try {
    return json(await createDraft(db, parsed.data, gate.userId), 201);
  } catch {
    return json({ error: "internal_error" }, 500);
  }
}
