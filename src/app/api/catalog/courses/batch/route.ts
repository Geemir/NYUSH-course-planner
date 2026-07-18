import { db } from "@/db";
import { CatalogCourseBatchRequestSchema } from "@/lib/catalog/contracts";
import { readCatalogCourseBatch } from "@/lib/catalog/searchRepository";
import { catalogJson, catalogRouteError } from "../../routeUtils";

export async function POST(request: Request) {
  try {
    const body = CatalogCourseBatchRequestSchema.parse(await request.json());
    return catalogJson(await readCatalogCourseBatch(db, body.stableIds));
  } catch (error) {
    return catalogRouteError(error instanceof SyntaxError ? new Error("invalid_json") : error);
  }
}
