import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requireAdminUser } from "@/lib/adminAuth";
import { CorrectionConflictError, CorrectionNotFoundError, transitionCorrection } from "@/lib/corrections/repository";
import { CorrectionPolicyError } from "@/lib/corrections/policy";

const InputSchema = z.object({ toStatus: z.enum(["in_review", "needs_information", "approved", "rejected"]), publicNote: z.string().trim().max(4000).optional(), privateNote: z.string().trim().max(4000).optional(), assignToSelf: z.boolean().optional() }).strict();
type Context = { params: Promise<{ id: string }> };
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request, context: Context) {
  const gate = await requireAdminUser();
  if (!("ok" in gate)) return response({ error: gate.error }, gate.status);
  try {
    const input = InputSchema.parse(await request.json());
    return response(await transitionCorrection(db, gate.userId, (await context.params).id, input));
  } catch (error) {
    if (error instanceof CorrectionNotFoundError) return response({ error: "not_found" }, 404);
    if (error instanceof CorrectionConflictError || error instanceof CorrectionPolicyError) return response({ error: "invalid_transition" }, 409);
    return response({ error: "invalid_request" }, 400);
  }
}
