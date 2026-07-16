import { describe, expect, it } from "vitest";
import {
  INSPIRATION_QUOTES,
  INSPIRATION_QUOTE_KEY,
  nextQuote,
  selectSessionQuote,
} from "@/lib/inspirationQuotes";

function createStorage(initialId: string | null = null): Storage {
  const values = new Map<string, string>();
  if (initialId !== null) values.set(INSPIRATION_QUOTE_KEY, initialId);

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("inspiration quote selection", () => {
  it("reuses the quote selected for the current session", () => {
    const storage = createStorage();

    const first = selectSessionQuote(storage, () => 0.4);
    const second = selectSessionQuote(storage, () => 0.9);

    expect(second).toEqual(first);
  });

  it("replaces an invalid stored id with a deterministic selection", () => {
    const storage = createStorage("retired-quote");
    const selected = selectSessionQuote(storage, () => 0);

    expect(selected).toEqual(INSPIRATION_QUOTES[0]);
    expect(storage.getItem(INSPIRATION_QUOTE_KEY)).toBe(selected.id);
  });

  it("cycles to the next quote and wraps after the final quote", () => {
    expect(nextQuote(INSPIRATION_QUOTES[0].id)).toEqual(
      INSPIRATION_QUOTES[1],
    );
    expect(nextQuote(INSPIRATION_QUOTES.at(-1)!.id)).toEqual(
      INSPIRATION_QUOTES[0],
    );
  });

  it("starts from the first quote when the current id is unknown", () => {
    expect(nextQuote("missing")).toEqual(INSPIRATION_QUOTES[0]);
  });
});
