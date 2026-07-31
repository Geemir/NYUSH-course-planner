import { NextResponse } from "next/server";
import { db } from "@/db";
import { readCatalogBootstrap } from "@/lib/catalog/searchRepository";
import { readTranslations, writeTranslations } from "@/lib/translation/repository";
import { translateBatch } from "@/lib/translation/translate";
import {
  MAX_SOURCE_CHARS,
  TranslationRequestSchema,
  translationKey,
  type TranslationLocale,
} from "@/lib/translation/types";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/**
 * Hashes of every string in the active release's programs. Translation is an
 * anonymous, paid operation, so requests are restricted to text the catalog
 * actually publishes — nobody can push arbitrary content through the provider.
 * Cached per release + locale; a new release rebuilds it.
 */
const allowedHashes = new Map<string, Set<string>>();

function collectStrings(value: unknown, into: string[]): void {
  if (typeof value === "string") {
    if (value.trim() && value.length <= MAX_SOURCE_CHARS) into.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, into);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, into);
  }
}

async function allowlistFor(locale: TranslationLocale): Promise<Set<string>> {
  const bootstrap = await readCatalogBootstrap(db);
  const cacheKey = `${bootstrap.release.id}:${locale}`;
  const cached = allowedHashes.get(cacheKey);
  if (cached) return cached;

  const strings: string[] = [];
  collectStrings(bootstrap.programs, strings);
  const hashes = new Set(strings.map((text) => translationKey(text, locale)));
  allowedHashes.clear(); // only the current release matters
  allowedHashes.set(cacheKey, hashes);
  return hashes;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = TranslationRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_request" }, 422);
  const { locale, texts } = parsed.data;

  const keyed = texts.map((text) => ({ text, key: translationKey(text, locale) }));
  // Keyed by the source text, not the cache hash: the hash is an internal
  // storage detail, and echoing the text keeps the client free of hashing.
  const translations: Record<string, string> = {};

  try {
    const cachedRows = await readTranslations(db, keyed.map((item) => item.key));
    for (const item of keyed) {
      const cached = cachedRows.get(item.key);
      if (cached) translations[item.text] = cached;
    }

    const missing = keyed.filter((item) => !cachedRows.has(item.key));
    if (missing.length > 0) {
      const allowed = await allowlistFor(locale);
      const translatable = missing.filter((item) => allowed.has(item.key));
      if (translatable.length > 0) {
        const results = await translateBatch(
          translatable.map((item) => item.text),
          locale,
        );
        const fresh = translatable
          .map((item, index) => ({
            id: item.key,
            sourceText: item.text,
            translatedText: results[index] ?? "",
          }))
          .filter((entry) => entry.translatedText.length > 0);
        await writeTranslations(db, locale, fresh);
        for (const entry of fresh) translations[entry.sourceText] = entry.translatedText;
      }
    }
  } catch {
    // Never fail the page: untranslated keys simply stay in English.
    return json({ locale, translations });
  }
  return json({ locale, translations });
}
