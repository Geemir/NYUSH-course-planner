"use client";

import { Ring } from "@/components/progress/Ring";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import { usePlannerStore } from "@/store/plannerStore";

const CREDITS_COLOR = "#3b82f6";

export function ProgressRings() {
  const { progress, progressByProgram, activeProgramObjs, allocation } =
    usePlanDerived();
  const { credits } = progress;
  const profile = usePlannerStore((state) => state.programProfile);
  const role = (programId: string) => programId === profile.coreProgramId
    ? "Core"
    : programId === profile.primaryMajorId
      ? "Primary"
      : programId === profile.secondMajorId
        ? "Second"
        : "Minor";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-x-5 gap-y-6">
        {activeProgramObjs.map((program) => {
          const p = progressByProgram.get(program.id);
          if (!p) return null;
          return (
            <Ring
              key={program.id}
              label={`${role(program.id)} · ${program.shortName}`}
              color={program.color}
              planned={p.plannedFraction}
              completed={p.completedFraction}
              center={`${Math.round(p.plannedFraction * 100)}%`}
              sub={`${Math.round(p.completedFraction * 100)}% earned`}
            />
          );
        })}
        <Ring
          label="Graduation"
          color={CREDITS_COLOR}
          planned={credits.planned / credits.goal}
          completed={credits.completed / credits.goal}
          center={`${credits.planned}`}
          sub={`${credits.completed} earned / ${credits.goal}`}
        />
      </div>
      {allocation.budget && (
        <p
          className="text-center text-sm text-muted-foreground"
          data-testid="double-count-budget"
        >
          Double-counted between majors:{" "}
          <span
            className={
              allocation.budget.used > allocation.budget.limit
                ? "font-semibold text-destructive"
                : "font-semibold"
            }
          >
            {allocation.budget.used}/{allocation.budget.limit}
          </span>
        </p>
      )}
    </div>
  );
}
