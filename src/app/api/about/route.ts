import { NextResponse } from "next/server";
import { db } from "@/db";
import { readAbout } from "@/lib/about/repository";
import { DEFAULT_ABOUT_CONTENT } from "@/lib/about/types";

/** Public: the editable About page content. No authentication required. */
export async function GET() {
  try {
    return NextResponse.json(await readAbout(db), {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch {
    // A database hiccup must not blank the page; serve the checked-in defaults.
    return NextResponse.json(
      { content: DEFAULT_ABOUT_CONTENT, updatedAt: null, updatedBy: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
