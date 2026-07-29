"use client";

import { useCallback, useEffect, useState } from "react";
import {
  completeOnboarding,
  readOnboardingState,
} from "@/lib/onboarding";

export function useOnboarding() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setOpen(readOnboardingState(window.localStorage).shouldOpen);
      } catch {
        setOpen(true);
      } finally {
        setReady(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const complete = useCallback(() => {
    try {
      completeOnboarding(window.localStorage);
    } catch {
      // Storage can be unavailable in privacy modes; dismissal still takes effect
      // for the current page session.
    }
    setOpen(false);
  }, []);

  const restart = useCallback(() => setOpen(true), []);

  return { open, ready, setOpen, complete, restart };
}
