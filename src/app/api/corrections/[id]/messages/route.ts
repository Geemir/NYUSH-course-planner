import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { addUserMessage, CorrectionConflictError, CorrectionNotFoundError } from "@/lib/corrections/repository";
import { createDatabaseCorrectionRateLimiter } from "@/lib/corrections/rateLimit";
import { CorrectionMessageInputSchema } from "@/lib/corrections/types";

type Context = { params: Promise<{ id: string }> };
export const messageRateLimiter = createDatabaseCorrectionRateLimiter(db);
const response = (body: unknown, status = 200, headers?: HeadersInit) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", ...headers } });

export async function POST(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return response({ error: "unauthorized" }, 401);
  const rate = await messageRateLimiter.check(session.user.id, "message");
  if (!rate.allowed) return response({ error: "rate_limited" }, 429, { "Retry-After": String(rate.retryAfter) });
  try {
    const input = CorrectionMessageInputSchema.parse(await request.json());
    return response(await addUserMessage(db, session.user.id, (await context.params).id, input.body), 201);
  } catch (error) {
    if (error instanceof CorrectionNotFoundError) return response({ error: "not_found" }, 404);
    if (error instanceof CorrectionConflictError) return response({ error: "invalid_transition" }, 409);
    return response({ error: "invalid_request" }, 400);
  }
}
