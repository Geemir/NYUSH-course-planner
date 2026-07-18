import { NextResponse } from "next/server";
import { CorrectionStatusSchema } from "@/lib/corrections/types";
import { db } from "@/db";
import { requireAdminUser } from "@/lib/adminAuth";
import { listAdminCorrections } from "@/lib/corrections/repository";

const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) {
  const gate = await requireAdminUser();
  if (!("ok" in gate)) return response({ error: gate.error }, gate.status);
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const parsed = status ? CorrectionStatusSchema.safeParse(status) : null;
  if (parsed && !parsed.success) return response({ error: "invalid_query" }, 400);
  return response(await listAdminCorrections(db, {
    status: parsed?.data,
    targetKind: params.get("targetKind") ?? undefined,
    issueType: params.get("issueType") ?? undefined,
    q: params.get("q")?.slice(0, 200) || undefined,
    assignedTo: params.get("assigned") === "unassigned" ? null : params.get("assigned") === "me" ? gate.userId : undefined,
    cursor: params.get("cursor") ?? undefined,
    limit: Number(params.get("limit") ?? 20),
  }));
}
