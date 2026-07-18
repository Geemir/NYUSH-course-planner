import { db } from "@/db";
import { readCatalogBootstrap } from "@/lib/catalog/searchRepository";
import { catalogJson, catalogRouteError } from "../routeUtils";

export async function GET() {
  try {
    return catalogJson(await readCatalogBootstrap(db));
  } catch (error) {
    return catalogRouteError(error);
  }
}
