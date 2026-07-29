import { describe, expect, it } from "vitest";
import {
  completeProgressGuide,
  PROGRESS_GUIDE_KEY,
  shouldOpenProgressGuide,
} from "@/lib/progressGuide";

describe("Progress guide state", () => {
  it("opens once per guide version and persists completion", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(shouldOpenProgressGuide(storage)).toBe(true);
    completeProgressGuide(storage);
    expect(values.get(PROGRESS_GUIDE_KEY)).toBeTruthy();
    expect(shouldOpenProgressGuide(storage)).toBe(false);
  });
});
