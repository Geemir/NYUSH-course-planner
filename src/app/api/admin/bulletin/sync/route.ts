import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requireAdmin } from "@/lib/adminAuth";
import { createBulletinFetch } from "@/lib/bulletin/fetch";
import { syncCatalogSources } from "@/lib/bulletin/syncAll";
import { CATALOG_SOURCES } from "@/lib/bulletin/sourceRegistry";

const fetcher = createBulletinFetch({
  timeoutMs: 15_000,
  retries: 2,
  userAgent: "NYUSH Course Planner Bulletin Synchronizer",
});

/** Starts one complete Bulletin synchronization for an authenticated admin. */
const SyncRequestSchema = z
  .object({
    sourceIds: z
      .array(
        z.string().refine(
          (sourceId) =>
            CATALOG_SOURCES.some(
              (source) => source.enabled && source.id === sourceId,
            ),
          "Unknown or disabled catalog source",
        ),
      )
      .optional(),
  })
  .strict();

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!("ok" in gate)) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const body = SyncRequestSchema.parse(await request.json());
    const result = await syncCatalogSources({
      sourceIds: body.sourceIds,
      fetchPage: fetcher,
      db,
    });
    if (
      result.sourceResults.some((source) =>
        source.diagnostics.includes("source-locked"),
      )
    ) {
      return NextResponse.json(
        { error: "bulletin source sync already in progress", result },
        { status: 409 },
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "invalid bulletin sync request" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "bulletin synchronization failed" },
      { status: 500 },
    );
  }
}
