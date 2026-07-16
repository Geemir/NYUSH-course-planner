export const ONBOARDING_KEY = "nyush-planner:onboarding:v1";

const COMPLETED_VALUE = "completed";

export type OnboardingStorage = Pick<Storage, "getItem" | "setItem">;

export function readOnboardingState(storage: OnboardingStorage): {
  shouldOpen: boolean;
} {
  return { shouldOpen: storage.getItem(ONBOARDING_KEY) !== COMPLETED_VALUE };
}

export function completeOnboarding(storage: OnboardingStorage): void {
  storage.setItem(ONBOARDING_KEY, COMPLETED_VALUE);
}
