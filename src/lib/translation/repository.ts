import { inArray } from "drizzle-orm";
import { translationCache } from "@/db/schema";
import type { TranslationLocale } from "@/lib/translation/types";
import type { Db } from "@/lib/repository";

export interface CachedTranslation {
  id: string;
  sourceText: string;
  translatedText: string;
}

/** Returns the cached translations for the given keys, keyed by hash. */
export async function readTranslations(
  db: Db,
  keys: string[],
): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();
  const rows = await db
    .select({
      id: translationCache.id,
      translatedText: translationCache.translatedText,
    })
    .from(translationCache)
    .where(inArray(translationCache.id, keys));
  return new Map(rows.map((row) => [row.id, row.translatedText]));
}

/** Stores new translations; existing keys are left untouched. */
export async function writeTranslations(
  db: Db,
  locale: TranslationLocale,
  entries: CachedTranslation[],
): Promise<void> {
  if (entries.length === 0) return;
  await db
    .insert(translationCache)
    .values(
      entries.map((entry) => ({
        id: entry.id,
        locale,
        sourceText: entry.sourceText,
        translatedText: entry.translatedText,
      })),
    )
    .onConflictDoNothing();
}
