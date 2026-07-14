import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { CourseParseError, parseCourseListing } from "@/lib/courseParser";

/** Parses one pasted Albert listing into a structured course (preview only). */
export async function POST(request: Request) {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!session?.user?.id || !email?.endsWith("@nyu.edu")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let text: unknown;
  try {
    ({ text } = await request.json());
  } catch {
    text = undefined;
  }

  try {
    const course = await parseCourseListing(text as string);
    return NextResponse.json({ course });
  } catch (e) {
    if (e instanceof CourseParseError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
