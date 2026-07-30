import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireAdminUser } from "@/lib/adminAuth";
import { readAbout, writeAbout } from "@/lib/about/repository";
import { AboutContentSchema } from "@/lib/about/types";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET() {
  const gate = await requireAdminUser();
  if (!("ok" in gate)) return json({ error: gate.error }, gate.status);
  try {
    return json(await readAbout(db));
  } catch {
    return json({ error: "internal_error" }, 500);
  }
}

export async function PUT(request: Request) {
  const gate = await requireAdminUser();
  if (!("ok" in gate)) return json({ error: gate.error }, gate.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = AboutContentSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: "invalid_about",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      422,
    );
  }
  try {
    return json(await writeAbout(db, parsed.data, gate.userId));
  } catch {
    return json({ error: "internal_error" }, 500);
  }
}
