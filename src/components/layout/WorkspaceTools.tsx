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
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 2xl:hidden">
      <div
        role="toolbar"
        aria-label="Workspace tools"
        className={cn(
          "pointer-events-auto flex items-center gap-1.5 rounded-xl border bg-background/95 p-1.5 shadow-lg backdrop-blur-sm",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
