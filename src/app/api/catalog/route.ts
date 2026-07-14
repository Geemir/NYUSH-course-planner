import { NextResponse } from "next/server";
import { db } from "@/db";
import { getCatalogResponse } from "@/lib/repository";

/** Public reference data from one active snapshot or the checked-in LKG. */
export async function GET() {
  return NextResponse.json(await getCatalogResponse(db));
}
