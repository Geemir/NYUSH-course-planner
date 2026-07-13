import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  CourseParseError,
  parseCourseListing,
  splitListings,
} from "@/lib/courseParser";
import { Course } from "@/lib/types";
import { deleteCourse, upsertCourses } from "@/lib/repository";

const MAX_LISTINGS = 25;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized", status: 401 } as const;
  if (session.user.role !== "admin")
    return { error: "forbidden", status: 403 } as const;
  return { ok: true } as const;
}

/**
 * Batch import. Body: { text, commit }.
 * - Splits a multi-course paste, parses each via DeepSeek (preview),
 * - and, when `commit` is true, upserts the successful ones to the shared
 *   catalog so they appear for everyone.
 */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!("ok" in gate)) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let text: string;
  let commit = false;
  try {
    const body = await request.json();
    text = String(body.text ?? "");
    commit = Boolean(body.commit);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const listings = splitListings(text).slice(0, MAX_LISTINGS);
  if (listings.length === 0) {
    return NextResponse.json({ error: "Paste course listings first." }, { status: 400 });
  }

  const courses: Course[] = [];
  const errors: { index: number; message: string }[] = [];

  for (let i = 0; i < listings.length; i++) {
    try {
      courses.push(await parseCourseListing(listings[i]));
    } catch (e) {
      errors.push({
        index: i,
        message: e instanceof CourseParseError ? e.message : "parse failed",
      });
    }
  }

  let committed = 0;
  if (commit && courses.length > 0) {
    committed = await upsertCourses(db, courses, "import");
  }

  return NextResponse.json({ courses, errors, committed });
}

/** Removes a course from the shared catalog. Query: ?id=CODE */
export async function DELETE(request: Request) {
  const gate = await requireAdmin();
  if (!("ok" in gate)) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await deleteCourse(db, id);
  return NextResponse.json({ ok: true });
}
