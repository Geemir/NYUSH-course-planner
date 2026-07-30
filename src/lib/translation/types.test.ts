import { describe, expect, it } from "vitest";
import {
  MAX_SOURCE_CHARS,
  MAX_TEXTS_PER_REQUEST,
  TranslationRequestSchema,
  translationKey,
} from "@/lib/translation/types";

describe("translationKey", () => {
  it("ignores whitespace differences so equivalent prose shares one cache entry", () => {
    expect(translationKey("Select  two\nof the following", "zhCN")).toBe(
      translationKey("Select two of the following", "zhCN"),
    );
  });

  it("separates entries by locale", () => {
    // Guards against a second locale overwriting the first one's cache row.
    expect(translationKey("Writing as Inquiry", "zhCN")).toHaveLength(64);
  });

  it("distinguishes different sources", () => {
    expect(translationKey("Select one", "zhCN")).not.toBe(
      translationKey("Select two", "zhCN"),
    );
  });
});

describe("TranslationRequestSchema", () => {
  it("accepts a bounded batch", () => {
    const parsed = TranslationRequestSchema.safeParse({
      locale: "zhCN",
      texts: ["Select two of the following"],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unsupported locales and unbounded payloads", () => {
    expect(
      TranslationRequestSchema.safeParse({ locale: "fr", texts: ["hi"] }).success,
    ).toBe(false);
    expect(
      TranslationRequestSchema.safeParse({
        locale: "zhCN",
        texts: Array.from({ length: MAX_TEXTS_PER_REQUEST + 1 }, () => "x"),
      }).success,
    ).toBe(false);
    expect(
      TranslationRequestSchema.safeParse({
        locale: "zhCN",
        texts: ["x".repeat(MAX_SOURCE_CHARS + 1)],
      }).success,
    ).toBe(false);
    expect(
      TranslationRequestSchema.safeParse({ locale: "zhCN", texts: [] }).success,
    ).toBe(false);
  });
});
