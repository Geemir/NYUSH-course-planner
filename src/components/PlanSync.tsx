"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { PlanSnapshot } from "@/lib/types";
import { snapshotFromState, usePlannerStore } from "@/store/plannerStore";

async function putPlan(snapshot: PlanSnapshot) {
  await fetch("/api/plan", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshot }),
  });
}

/**
 * Bridges the local Zustand plan with the server when signed in:
 * - on login, loads the user's saved plan (or offers to adopt the current
 *   guest plan on first login),
 * - then autosaves changes (debounced) to the account.
 * Signed out, the app keeps using localStorage exactly as before.
 */
export function PlanSync() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    let unsub: () => void = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        const res = await fetch("/api/plan");
        if (!res.ok || !active) return;
        const { snapshot } = (await res.json()) as {
          snapshot: PlanSnapshot | null;
        };
        const local = snapshotFromState(usePlannerStore.getState());
        const localHasContent =
          local.placements.length > 0 || local.customCourses.length > 0;

        if (snapshot) {
          usePlannerStore.getState().importPlan(snapshot);
          toast.success("Loaded your saved plan");
        } else if (
          localHasContent &&
          window.confirm(
            "Save your current plan to your NYU account? (Otherwise it stays only on this device.)",
          )
        ) {
          await putPlan(local);
          toast.success("Saved your plan to your account");
        }
      } catch {
        /* offline / transient — keep local copy */
      }
      if (!active) return;

      // Subscribe AFTER the initial load so we don't echo it straight back.
      unsub = usePlannerStore.subscribe(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          putPlan(snapshotFromState(usePlannerStore.getState())).catch(() => {});
        }, 800);
      });
    })();

    return () => {
      active = false;
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [status]);

  return null;
}
