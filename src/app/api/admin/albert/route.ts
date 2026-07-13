import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { AlbertError, importSubject } from "@/lib/albert";
import { getAllCourses, upsertCourses } from "@/lib/repository";

/**
 * On-demand import from NYU's public class-search API.
 * Body: { subject, commit }.
 * - preview (default): fetch + normalize, return the courses without saving.
 * - commit: also upsert them into the shared catalog (source "albert").
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let subject: string;
  let commit = false;
  let enrich = false;
  try {
    const body = await request.json();
    subject = String(body.subject ?? "");
    commit = Boolean(body.commit);
    enrich = Boolean(body.enrich);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    // For AI prereq mapping, give the model the full catalog (names → codes).
    const catalog = enrich ? await getAllCourses(db) : undefined;
    const result = await importSubject(subject, { enrich, catalog });
    let committed = 0;
    if (commit && result.courses.length > 0) {
      committed = await upsertCourses(db, result.courses, "albert");
    }
    return NextResponse.json({
      courses: result.courses,
      committed,
      stats: {
        sectionsSeen: result.sectionsSeen,
        distinctCourses: result.distinctCourses,
        detailCalls: result.detailCalls,
        enrichedCourses: result.enrichedCourses,
      },
    });
  } catch (e) {
    if (e instanceof AlbertError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
