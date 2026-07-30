"use client";

import type { ReactNode } from "react";
import { WORKSPACE_TOOLS_HIDDEN_CLASS } from "@/components/layout/workspaceBreakpoints";
import { cn } from "@/lib/utils";

export function WorkspaceTools({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 z-[var(--z-sticky)] flex justify-center px-4",
        // Must match the progress rail's breakpoint, or a width band exists
        // where neither the rail nor this toolbar is shown.
        WORKSPACE_TOOLS_HIDDEN_CLASS,
      )}
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div
        role="toolbar"
        aria-label="Workspace tools"
        className={cn(
          "functional-glass pointer-events-auto flex items-center gap-2 rounded-2xl p-2 shadow-[0_12px_35px_rgb(31_24_36/16%)]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
