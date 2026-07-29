import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db";
import { requireMaintainerUser } from "@/lib/adminAuth";
import { readCatalogBootstrap } from "@/lib/catalog/searchRepository";
import { applyDirectCatalogOverlay, listDirectCatalogOverlays } from "@/lib/catalogMaintenance/repository";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  const gate = await requireMaintainerUser();
  if (!("ok" in gate)) return NextResponse.json({ error: gate.error }, { status: gate.status, headers: noStore });
  const [bootstrap, overlays] = await Promise.all([
    readCatalogBootstrap(db),
    listDirectCatalogOverlays(db),
  ]);
  return NextResponse.json({ releaseId: bootstrap.release.id, programs: bootstrap.programs, overlays }, { headers: noStore });
}

export async function POST(request: Request) {
  const gate = await requireMaintainerUser();
  if (!("ok" in gate)) return NextResponse.json({ error: gate.error }, { status: gate.status, headers: noStore });
  try {
    const overlay = await applyDirectCatalogOverlay(db, gate.userId, await request.json());
    return NextResponse.json({ overlay }, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "invalid catalog maintenance input", issues: error.issues }, { status: 400, headers: noStore });
    throw error;
  }
}

