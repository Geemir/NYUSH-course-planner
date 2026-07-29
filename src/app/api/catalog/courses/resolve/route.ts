import { db } from "@/db";
import { CatalogCourseResolveRequestSchema } from "@/lib/catalog/contracts";
import { resolveActiveCourseCodes } from "@/lib/catalog/searchRepository";
import { catalogJson, catalogRouteError } from "../../routeUtils";

export async function POST(request: Request) {
  try {
    const body = CatalogCourseResolveRequestSchema.parse(await request.json());
    return catalogJson(await resolveActiveCourseCodes(db, body.codes));
  } catch (error) {
    return catalogRouteError(
      error instanceof SyntaxError ? new Error("invalid_json") : error,
    );
  }
}
