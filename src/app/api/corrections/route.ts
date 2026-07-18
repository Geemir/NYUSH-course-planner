import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { createCorrection, listUserCorrections } from "@/lib/corrections/repository";
import { createDatabaseCorrectionRateLimiter } from "@/lib/corrections/rateLimit";
import { CorrectionStatusSchema, CreateCorrectionRequestSchema } from "@/lib/corrections/types";

export const correctionRateLimiter = createDatabaseCorrectionRateLimiter(db);
const response = (body: unknown, status = 200, headers?: HeadersInit) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", ...headers } });

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return response({ error: "unauthorized" }, 401);
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const parsedStatus = status ? CorrectionStatusSchema.safeParse(status) : null;
  if (parsedStatus && !parsedStatus.success) return response({ error: "invalid_query" }, 400);
  return response(await listUserCorrections(db, session.user.id, { status: parsedStatus?.data, cursor: params.get("cursor") ?? undefined, limit: Number(params.get("limit") ?? 20) }));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return response({ error: "unauthorized" }, 401);
  const rate = await correctionRateLimiter.check(session.user.id, "create");
  if (!rate.allowed) return response({ error: "rate_limited" }, 429, { "Retry-After": String(rate.retryAfter) });
  try {
    const input = CreateCorrectionRequestSchema.parse(await request.json());
    return response(await createCorrection(db, session.user.id, input), 201);
  } catch {
    return response({ error: "invalid_request" }, 400);
  }
}
