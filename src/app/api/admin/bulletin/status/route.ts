import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireAdmin } from "@/lib/adminAuth";
import { getCatalogStatus } from "@/lib/catalogRepository";

/** Returns the active Bulletin snapshot and recent synchronization outcomes. */
export async function GET() {
  const gate = await requireAdmin();
  if (!("ok" in gate)) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    return NextResponse.json(await getCatalogStatus(db));
  } catch {
    return NextResponse.json(
      { error: "bulletin status unavailable" },
      { status: 500 },
    );
  }
}
