import { eq } from "drizzle-orm";
import { siteAbout } from "@/db/schema";
import {
  AboutContentSchema,
  DEFAULT_ABOUT_CONTENT,
  type AboutContent,
  type AboutRecord,
} from "@/lib/about/types";
import type { Db } from "@/lib/repository";

/** The About page is a singleton row. */
export const SITE_ABOUT_ID = "site";

/**
 * Reads the editable About content. Falls back to the checked-in defaults when
 * no row exists yet (fresh deployment) or when a stored row fails validation,
 * so the public page always renders something truthful.
 */
export async function readAbout(db: Db): Promise<AboutRecord> {
  const [row] = await db
    .select({
      content: siteAbout.content,
      updatedAt: siteAbout.updatedAt,
      updatedBy: siteAbout.updatedBy,
    })
    .from(siteAbout)
    .where(eq(siteAbout.id, SITE_ABOUT_ID))
    .limit(1);

  if (!row) {
    return { content: DEFAULT_ABOUT_CONTENT, updatedAt: null, updatedBy: null };
  }
  const parsed = AboutContentSchema.safeParse(row.content);
  return {
    content: parsed.success ? parsed.data : DEFAULT_ABOUT_CONTENT,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    updatedBy: row.updatedBy ?? null,
  };
}

/** Validates and upserts the singleton row. */
export async function writeAbout(
  db: Db,
  content: AboutContent,
  updatedBy: string,
): Promise<AboutRecord> {
  const validated = AboutContentSchema.parse(content);
  const updatedAt = new Date();
  await db
    .insert(siteAbout)
    .values({ id: SITE_ABOUT_ID, content: validated, updatedBy, updatedAt })
    .onConflictDoUpdate({
      target: siteAbout.id,
      set: { content: validated, updatedBy, updatedAt },
    });
  return { content: validated, updatedAt: updatedAt.toISOString(), updatedBy };
}
