import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  deleteRule,
  getRulesByStatus,
  setRuleStatus,
  upsertRule,
} from "@/lib/repository";
import { SpecialRuleSchema } from "@/lib/types";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized", status: 401 } as const;
  if (session.user.role !== "admin")
    return { error: "forbidden", status: 403 } as const;
  return { ok: true } as const;
}

/** Lists active rules and the pending-review draft queue. */
export async function GET() {
  const gate = await requireAdmin();
  if (!("ok" in gate)) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  // Sequential — dev PGlite is single-connection (Neon/prod is unaffected).
  const active = await getRulesByStatus(db, "active");
  const drafts = await getRulesByStatus(db, "draft");
  return NextResponse.json({ active, drafts });
}

/** Creates/updates a rule. Body: a SpecialRule + optional { status }. */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!("ok" in gate)) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const status = body.status === "draft" ? "draft" : "active";
  const { status: _ignored, ...ruleInput } = body;
  void _ignored;
  const withId =
    "id" in ruleInput && ruleInput.id
      ? ruleInput
      : { ...ruleInput, id: crypto.randomUUID() };
  const parsed = SpecialRuleSchema.safeParse(withId);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid rule" },
      { status: 422 },
    );
  }
  await upsertRule(db, parsed.data, status);
  return NextResponse.json({ rule: parsed.data, status });
}

/** Approve a draft (or send back to draft). Body: { id, status }. */
export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if (!("ok" in gate)) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  let body: { id?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const status = body.status === "draft" ? "draft" : "active";
  if (!body.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await setRuleStatus(db, body.id, status);
  return NextResponse.json({ ok: true });
}

/** Deletes/rejects a rule. Query: ?id=... */
export async function DELETE(request: Request) {
  const gate = await requireAdmin();
  if (!("ok" in gate)) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await deleteRule(db, id);
  return NextResponse.json({ ok: true });
}
