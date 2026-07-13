import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { parsePlan } from "@/lib/planIO";
import { getActivePlan, saveActivePlan } from "@/lib/repository";

/** Returns the signed-in user's saved plan snapshot, or null if none yet. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const snapshot = await getActivePlan(db, session.user.id);
  return NextResponse.json({ snapshot });
}

/** Saves (upserts) the user's plan. Body: { snapshot }. */
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let snapshot;
  try {
    const body = await request.json();
    // Reuse parsePlan to validate + sanitize (drops unknown courses/programs).
    snapshot = parsePlan(JSON.stringify(body.snapshot));
  } catch {
    return NextResponse.json({ error: "invalid snapshot" }, { status: 400 });
  }

  await saveActivePlan(db, session.user.id, snapshot);
  return NextResponse.json({ ok: true });
}
