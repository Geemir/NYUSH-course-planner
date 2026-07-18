import { z } from "zod";
import { db } from "@/db";
import { readCatalogCourse } from "@/lib/catalog/searchRepository";
import { catalogJson, catalogRouteError } from "../../routeUtils";

const StableIdSchema = z.string().min(3).max(240).regex(/^[a-z0-9-]+:.+$/i);

export async function GET(
  _request: Request,
  context: RouteContext<"/api/catalog/courses/[stableId]">,
) {
  try {
    const { stableId } = await context.params;
    const record = await readCatalogCourse(db, StableIdSchema.parse(stableId));
    return record
      ? catalogJson(record)
      : catalogJson({ error: "course_not_found" }, { status: 404 });
  } catch (error) {
    return catalogRouteError(error);
  }
}
