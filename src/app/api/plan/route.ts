import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { PlanSnapshotV2Schema } from "@/lib/planIO";
import {
  getActivePlanEnvelope,
  saveActivePlanRevision,
} from "@/lib/repository";

const SavePlanRequestSchema = z.object({
  snapshot: PlanSnapshotV2Schema,
  baseRevision: z.number().int().positive().nullable(),
}).strict();

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getActivePlanEnvelope(db, session.user.id));
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let input: z.infer<typeof SavePlanRequestSchema>;
  try {
    input = SavePlanRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const result = await saveActivePlanRevision(
    db,
    session.user.id,
    input.snapshot,
    input.baseRevision,
  );
  if (result.status === "conflict") {
    return NextResponse.json(
      { error: "revision_conflict", server: result.server },
      { status: 409 },
    );
  }
  return NextResponse.json(result);
}
