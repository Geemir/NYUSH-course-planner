"use client";

import {
  AlertTriangle,
  Check,
  CloudOff,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { PlanSyncState } from "@/hooks/usePlanSync";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PlanSyncStatusProps {
  state: PlanSyncState;
  onRetry?: () => void;
  onKeepLocal?: () => void;
  onUseServer?: () => void;
  onExportBoth?: () => void;
}

function statusContent(state: Exclude<PlanSyncState, { status: "conflict" }>) {
  switch (state.status) {
    case "saving":
      return { icon: LoaderCircle, label: "Saving", spin: true };
    case "saved":
      return { icon: Check, label: "Saved", spin: false };
    case "offline":
      return { icon: CloudOff, label: "Offline — changes kept locally", spin: false };
    case "error":
      return { icon: AlertTriangle, label: "Could not sync", spin: false };
    case "local-only":
      return { icon: CloudOff, label: state.message, spin: false };
  }
}

export function PlanSyncStatus({
  state,
  onRetry,
  onKeepLocal,
  onUseServer,
  onExportBoth,
}: PlanSyncStatusProps) {
  const visible = state.status === "conflict"
    ? { icon: AlertTriangle, label: "Plan conflict", spin: false }
    : statusContent(state);
  const Icon = visible.icon;
  const canRetry = state.status === "offline" || state.status === "error";

  return (
    <>
      <div
        className="fixed right-4 bottom-4 z-[var(--z-sticky)] flex min-h-9 items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur sm:right-6 sm:bottom-6"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <Icon className={visible.spin ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden="true" />
        <span>{visible.label}</span>
        {canRetry && onRetry && (
          <Button variant="ghost" size="xs" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Retry
          </Button>
        )}
      </div>

      <Dialog open={state.status === "conflict"}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Choose which plan to keep</DialogTitle>
            <DialogDescription>
              This plan changed in another session. Both copies are preserved until you choose an action.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/50 p-3 text-sm">
            <p className="font-medium">Nothing has been overwritten.</p>
            <p className="mt-1 text-muted-foreground">
              Keep this device&apos;s plan, restore the server copy, or export both before deciding.
            </p>
          </div>
          <DialogFooter className="flex-wrap">
            <Button variant="outline" onClick={onExportBoth}>Export both</Button>
            <Button variant="outline" onClick={onUseServer}>Use server</Button>
            <Button onClick={onKeepLocal}>Keep local</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
