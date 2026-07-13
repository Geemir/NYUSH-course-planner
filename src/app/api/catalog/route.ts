import { NextResponse } from "next/server";
import { db } from "@/db";
import { getActiveRules, getAllCourses } from "@/lib/repository";

/** Public reference data: the shared course catalog + active special rules. */
export async function GET() {
  try {
    // Sequential (not Promise.all): the dev PGlite driver is single-connection
    // and aborts on concurrent queries. Neon/prod handles concurrency fine.
    const courses = await getAllCourses(db);
    const rules = await getActiveRules(db);
    return NextResponse.json({ courses, rules });
  } catch (e) {
    // Client falls back to the bundled catalog; log so the failure is visible.
    console.error("[catalog] failed to read reference data:", e);
    return NextResponse.json({ courses: [], rules: [] }, { status: 200 });
  }
}
