"use client";

import type { ReactNode } from "react";
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
      className="pointer-events-none fixed inset-x-0 z-[var(--z-sticky)] flex justify-center px-4 2xl:hidden"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div
        role="toolbar"
        aria-label="Workspace tools"
        className={cn(
          "pointer-events-auto flex items-center gap-2 rounded-xl border bg-background p-2 shadow-sm",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
