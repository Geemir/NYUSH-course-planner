"use client";

import { useState } from "react";
import { Pencil, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlanningSlot, SemesterId } from "@/lib/types";
import { usePlannerStore } from "@/store/plannerStore";

export interface PlanningSlotSelection {
  query: string;
  slotId: string;
  semesterId: SemesterId;
}

export function PlanningSlotCard({ slot, onChoose }: { slot: PlanningSlot; onChoose(selection: PlanningSlotSelection): void }) {
  const [editing, setEditing] = useState(false);
  const update = usePlannerStore((state) => state.updatePlanningSlot);
  const remove = usePlannerStore((state) => state.removePlanningSlot);
  return (
    <article className="rounded-xl border border-dashed border-primary/35 bg-primary/5 p-3" data-testid={`planning-slot-${slot.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <Input
              autoFocus
              aria-label="Planning slot label"
              defaultValue={slot.label}
              onBlur={(event) => {
                const label = event.target.value.trim();
                if (label) update(slot.id, { label });
                setEditing(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setEditing(false);
              }}
            />
          ) : (
            <p className="text-sm font-medium">{slot.label}</p>
          )}
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            Tentative · {slot.credits === null ? "credits TBD" : `${slot.credits} cr`}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${slot.label}`} onClick={() => setEditing(true)}><Pencil aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${slot.label}`} onClick={() => remove(slot.id)}><Trash2 aria-hidden="true" /></Button>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={() => onChoose({ query: slot.label, slotId: slot.id, semesterId: slot.semesterId })}>
        <Search aria-hidden="true" /> Choose course
      </Button>
    </article>
  );
}
