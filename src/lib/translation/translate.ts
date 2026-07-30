import "server-only";
import type { TranslationLocale } from "@/lib/translation/types";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

const LOCALE_NAMES: Record<TranslationLocale, string> = {
  zhCN: "Simplified Chinese (简体中文)",
};

/**
 * The prompt deliberately forbids reinterpreting requirements: course codes,
 * numbers, and credit counts must survive verbatim, because a mistranslated
 * "select two" would misstate a degree rule.
 */
function systemPrompt(locale: TranslationLocale): string {
  return [
    `You translate university bulletin text into ${LOCALE_NAMES[locale]}.`,
    "Rules:",
    "- Translate meaning faithfully; never add, drop, or reinterpret a requirement.",
    "- Keep course codes (e.g. CSCI-SHU 101), numbers, credit counts, and proper",
    "  nouns such as NYU Shanghai exactly as they appear.",
    "- Keep the same number of items, in the same order.",
    'Reply with JSON only: {"translations":["…", "…"]} — one entry per input, same order.',
  ].join("\n");
}

/**
 * Translates a batch in one call. Returns translations positionally aligned
 * with `texts`; on any failure it returns an empty array so the caller can fall
 * back to the English source rather than showing an error.
 */
export async function translateBatch(
  texts: string[],
  locale: TranslationLocale,
): Promise<string[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || texts.length === 0) return [];

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(locale) },
          { role: "user", content: JSON.stringify({ texts }) },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) return [];

    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content) as { translations?: unknown };
    const translations = parsed.translations;
    if (!Array.isArray(translations) || translations.length !== texts.length) {
      // A length mismatch means the alignment is untrustworthy — discard it all.
      return [];
    }
    return translations.map((value) => (typeof value === "string" ? value.trim() : ""));
  } catch {
    return [];
  }
}
