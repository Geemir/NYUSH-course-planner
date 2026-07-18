import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { listNotifications, markNotificationsRead } from "@/lib/corrections/repository";

const PatchSchema = z.union([
  z.object({ ids: z.array(z.string().min(1)).min(1).max(100) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return response({ error: "unauthorized" }, 401);
  const limit = Math.min(50, Math.max(1, Number(new URL(request.url).searchParams.get("limit") ?? 20)));
  const items = await listNotifications(db, session.user.id, limit);
  return response({ items, unreadCount: items.filter((item) => !item.readAt).length, nextCursor: null });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return response({ error: "unauthorized" }, 401);
  try {
    const input = PatchSchema.parse(await request.json());
    return response({ updated: (await markNotificationsRead(db, session.user.id, input)).length });
  } catch {
    return response({ error: "invalid_request" }, 400);
  }
}
