"use client";

import { useCallback, useState } from "react";
import { completeProgressGuide, shouldOpenProgressGuide } from "@/lib/progressGuide";

export function useProgressGuide() {
  const [open, setOpen] = useState(false);

  const visit = useCallback(() => {
    try {
      if (shouldOpenProgressGuide(window.localStorage)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  const complete = useCallback(() => {
    try {
      completeProgressGuide(window.localStorage);
    } catch {
      // The current-session dismissal still works when storage is unavailable.
    }
    setOpen(false);
  }, []);

  const restart = useCallback(() => setOpen(true), []);
  return { open, setOpen, visit, complete, restart };
}
