"use client";

import { useEffect } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlannerStore } from "@/store/plannerStore";

function isTextEditing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function UndoButton() {
  const undo = usePlannerStore((state) => state.undo);
  const redo = usePlannerStore((state) => state.redo);
  const canUndo = usePlannerStore((state) => state.canUndo);
  const undoLabel = usePlannerStore((state) => state.undoLabel);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z" || isTextEditing(event.target)) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={!canUndo}
      aria-label={undoLabel ? `Undo: ${undoLabel}` : "Undo unavailable"}
      onClick={undo}
    >
      <Undo2 aria-hidden="true" />
    </Button>
  );
}
