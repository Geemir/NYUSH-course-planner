import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requireAdminUser } from "@/lib/adminAuth";
import { CorrectionConflictError, CorrectionNotFoundError, mergeDuplicateCorrection } from "@/lib/corrections/repository";

const InputSchema = z.object({ canonicalRequestId: z.string().min(1), publicNote: z.string().trim().min(5).max(4000) }).strict();
type Context = { params: Promise<{ id: string }> };
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request, context: Context) {
  const gate = await requireAdminUser();
  if (!("ok" in gate)) return response({ error: gate.error }, gate.status);
  try {
    const input = InputSchema.parse(await request.json());
    return response(await mergeDuplicateCorrection(db, gate.userId, (await context.params).id, input.canonicalRequestId, input.publicNote));
  } catch (error) {
    if (error instanceof CorrectionNotFoundError) return response({ error: "not_found" }, 404);
    if (error instanceof CorrectionConflictError) return response({ error: "invalid_merge" }, 409);
    return response({ error: "invalid_request" }, 400);
  }
}
