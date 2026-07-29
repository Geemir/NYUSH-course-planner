import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { db } from "@/db";
import { requireMaintainerUser } from "@/lib/adminAuth";
import { CatalogMaintenanceNotFoundError, setCatalogOverlayActive } from "@/lib/catalogMaintenance/repository";

const StatusChangeSchema = z.object({
  active: z.boolean(),
  reason: z.string().trim().min(3).max(1000),
}).strict();
const noStore = { "Cache-Control": "private, no-store" };

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireMaintainerUser();
  if (!("ok" in gate)) return NextResponse.json({ error: gate.error }, { status: gate.status, headers: noStore });
  try {
    const [{ id }, input] = await Promise.all([context.params, request.json().then((body) => StatusChangeSchema.parse(body))]);
    const overlay = await setCatalogOverlayActive(db, gate.userId, id, input.active, input.reason);
    return NextResponse.json({ overlay }, { headers: noStore });
  } catch (error) {
    if (error instanceof CatalogMaintenanceNotFoundError) return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });
    if (error instanceof ZodError) return NextResponse.json({ error: "invalid catalog maintenance input", issues: error.issues }, { status: 400, headers: noStore });
    throw error;
  }
}

