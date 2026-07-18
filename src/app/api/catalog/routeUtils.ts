import { NextResponse } from "next/server";
import { z } from "zod";
import { CatalogUnavailableError } from "@/lib/catalog/searchRepository";

export const CATALOG_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
} as const;

export function catalogJson(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...CATALOG_RESPONSE_HEADERS, ...init.headers },
  });
}

export function catalogRouteError(error: unknown) {
  if (error instanceof Error && error.message === "invalid_json") {
    return catalogJson(
      { error: "invalid_request", issues: [{ path: [], message: "Invalid JSON body" }] },
      { status: 400 },
    );
  }
  if (error instanceof z.ZodError) {
    return catalogJson(
      { error: "invalid_request", issues: error.issues.map(({ path, message }) => ({ path, message })) },
      { status: 400 },
    );
  }
  if (error instanceof CatalogUnavailableError) {
    return catalogJson({ error: "catalog_unavailable" }, { status: 503 });
  }
  return catalogJson({ error: "catalog_unavailable" }, { status: 503 });
}
