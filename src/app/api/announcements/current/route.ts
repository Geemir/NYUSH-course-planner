import { NextResponse } from "next/server";
import { db } from "@/db";
import { getCurrentAnnouncement } from "@/lib/announcements/repository";

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

export async function GET() {
  let announcement;
  try {
    announcement = await getCurrentAnnouncement(db);
  } catch {
    return json({ error: "internal_error" }, 500);
  }
  return json({ announcement });
}
