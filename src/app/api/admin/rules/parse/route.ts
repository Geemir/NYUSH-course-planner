import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { getAllCourses } from "@/lib/repository";
import { parseRuleText, RuleParseError } from "@/lib/ruleParser";

/** Agent: turn an admin's plain-English description into a structured rule. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let text: string;
  try {
    text = String((await request.json()).text ?? "");
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    const courses = await getAllCourses(db);
    const parsed = await parseRuleText(text, courses);
    return NextResponse.json(parsed);
  } catch (e) {
    if (e instanceof RuleParseError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
