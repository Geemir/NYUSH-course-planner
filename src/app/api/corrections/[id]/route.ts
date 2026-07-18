import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { CorrectionConflictError, CorrectionNotFoundError, readUserCorrection, withdrawCorrection } from "@/lib/corrections/repository";

type Context = { params: Promise<{ id: string }> };
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return response({ error: "unauthorized" }, 401);
  const detail = await readUserCorrection(db, session.user.id, (await context.params).id);
  return detail ? response(detail) : response({ error: "not_found" }, 404);
}

export async function PATCH(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return response({ error: "unauthorized" }, 401);
  try {
    const body = await request.json();
    if (body?.action !== "withdraw" || Object.keys(body).some((key) => key !== "action")) return response({ error: "invalid_request" }, 400);
    return response(await withdrawCorrection(db, session.user.id, (await context.params).id));
  } catch (error) {
    if (error instanceof CorrectionNotFoundError) return response({ error: "not_found" }, 404);
    if (error instanceof CorrectionConflictError) return response({ error: "invalid_transition" }, 409);
    return response({ error: "invalid_request" }, 400);
  }
}
