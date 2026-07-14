import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireAdmin } from "@/lib/adminAuth";
import { createBulletinFetch } from "@/lib/bulletin/fetch";
import {
  BulletinSyncInProgressError,
  syncBulletin,
} from "@/lib/bulletin/sync";

const fetcher = createBulletinFetch({
  timeoutMs: 15_000,
  retries: 2,
  userAgent: "NYUSH Course Planner Bulletin Synchronizer",
});

/** Starts one complete Bulletin synchronization for an authenticated admin. */
export async function POST() {
  const gate = await requireAdmin();
  if (!("ok" in gate)) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const result = await syncBulletin({
      fetcher,
      db,
      now: () => new Date(),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BulletinSyncInProgressError) {
      return NextResponse.json(
        { error: "bulletin sync already in progress" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "bulletin synchronization failed" },
      { status: 500 },
    );
  }
}
