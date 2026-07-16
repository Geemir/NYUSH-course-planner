"use client";

import { Sparkles } from "lucide-react";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import { Course, SpecialRule } from "@/lib/types";

function title(coursesById: Map<string, Course>, id: string): string {
  return coursesById.get(id)?.title ?? id;
}

/** Plain-English description of a special rule for the student. */
export function describeRule(
  rule: SpecialRule,
  coursesById: Map<string, Course>,
): string {
  if (rule.note) return rule.note;
  const t = (id: string) => title(coursesById, id);
  if (rule.kind === "equivalence") {
    return `${t(rule.course)} counts as ${t(rule.target)}.`;
  }
  const base = `${t(rule.course)} may be taken in the same semester as ${t(rule.prereq)}`;
  return rule.condition
    ? `${base} if you earn ${rule.condition.minGrade} or better in ${t(rule.condition.course)}.`
    : `${base}.`;
}

export function SpecialRulesPanel() {
  const { specialRules, coursesById } = usePlanDerived();
  if (specialRules.length === 0) return null;

  return (
    <div data-testid="special-rules-panel">
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <Sparkles className="size-4 text-primary" />
        Special rules
      </h3>
      <ul className="flex flex-col gap-2 py-2">
        {specialRules.map((rule) => (
          <li key={rule.id} className="text-sm leading-snug text-muted-foreground">
            {describeRule(rule, coursesById)}
          </li>
        ))}
      </ul>
    </div>
  );
}
