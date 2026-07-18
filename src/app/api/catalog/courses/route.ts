import { z } from "zod";
import { db } from "@/db";
import { parseCatalogCourseSearchParams } from "@/lib/catalog/contracts";
import { searchCatalogCourses } from "@/lib/catalog/searchRepository";
import { catalogJson, catalogRouteError } from "../routeUtils";

export async function GET(request: Request) {
  try {
    const query = parseCatalogCourseSearchParams(new URL(request.url).searchParams);
    return catalogJson(await searchCatalogCourses(db, query));
  } catch (error) {
    return catalogRouteError(
      error instanceof Error && error.message.startsWith("Unknown catalog query")
        ? new z.ZodError([{ code: "custom", path: [], message: error.message, input: request.url }])
        : error,
    );
  }
}
