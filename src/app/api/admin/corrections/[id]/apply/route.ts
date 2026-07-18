import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireAdminUser } from "@/lib/adminAuth";
import { getActiveReleaseCatalog } from "@/lib/catalogRepository";
import { CorrectionOverlayInputSchema } from "@/lib/corrections/policy";
import { applyCorrectionOverlay, CorrectionConflictError, CorrectionNotFoundError, readAdminCorrection } from "@/lib/corrections/repository";

type Context = { params: Promise<{ id: string }> };
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request, context: Context) {
  const gate = await requireAdminUser();
  if (!("ok" in gate)) return response({ error: gate.error }, gate.status);
  try {
    const requestId = (await context.params).id;
    const input = CorrectionOverlayInputSchema.parse(await request.json());
    const [correction, catalog] = await Promise.all([readAdminCorrection(db, requestId), getActiveReleaseCatalog(db)]);
    if (!correction) return response({ error: "not_found" }, 404);
    if (!catalog || (correction.catalogReleaseId && correction.catalogReleaseId !== catalog.release.id)) return response({ error: "stale_target" }, 409);
    const exists = input.kind === "course"
      ? catalog.courses.some((course) => course.stableId === input.stableId)
      : input.kind === "requirement"
        ? catalog.programs.some((program) => program.id === input.programId && program.categories.some((category) => category.id === input.requirementId))
        : input.kind === "program-note"
          ? catalog.programs.some((program) => program.id === input.programId)
          : true;
    if (!exists) return response({ error: "stale_target" }, 409);
    return response(await applyCorrectionOverlay(db, gate.userId, requestId, input, catalog.release.id));
  } catch (error) {
    if (error instanceof CorrectionNotFoundError) return response({ error: "not_found" }, 404);
    if (error instanceof CorrectionConflictError) return response({ error: "invalid_apply" }, 409);
    return response({ error: "invalid_request" }, 400);
  }
}
