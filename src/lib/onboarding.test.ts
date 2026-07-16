import { describe, expect, it } from "vitest";
import {
  ONBOARDING_KEY,
  completeOnboarding,
  readOnboardingState,
} from "@/lib/onboarding";

function createStorage(initialValue: string | null = null): Storage {
  const values = new Map<string, string>();
  if (initialValue !== null) values.set(ONBOARDING_KEY, initialValue);

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

describe("onboarding persistence", () => {
  it("uses the versioned planner onboarding key", () => {
    expect(ONBOARDING_KEY).toBe("nyush-planner:onboarding:v1");
  });

  it("opens on first visit and stays closed after completion", () => {
    const storage = createStorage();

    expect(readOnboardingState(storage)).toEqual({ shouldOpen: true });
    completeOnboarding(storage);
    expect(readOnboardingState(storage)).toEqual({ shouldOpen: false });
  });

  it.each(["true", "false", "1", "{}", "completed "])(
    "treats invalid stored value %s as a first visit",
    (value) => {
      expect(readOnboardingState(createStorage(value))).toEqual({
        shouldOpen: true,
      });
    },
  );
});
