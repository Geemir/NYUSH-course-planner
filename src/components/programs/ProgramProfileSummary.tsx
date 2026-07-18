"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProgramProfile } from "@/lib/programProfile";
import type { CatalogProgram } from "@/lib/types";

export function programProfileLabel(
  profile: ProgramProfile,
  programs: readonly CatalogProgram[],
): string {
  const byId = new Map(programs.map((program) => [program.id, program]));
  const primary = byId.get(profile.primaryMajorId)?.shortName ?? profile.primaryMajorId;
  const additions = Number(Boolean(profile.secondMajorId)) + profile.minorIds.length;
  if (additions === 0) return primary;
  const parts = [
    profile.secondMajorId ? "1 major" : null,
    profile.minorIds.length ? `${profile.minorIds.length} minor${profile.minorIds.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return `${primary} + ${parts.join(" + ")}`;
}

export function ProgramProfileSummary({
  profile,
  programs,
  onClick,
}: {
  profile: ProgramProfile;
  programs: readonly CatalogProgram[];
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 max-w-64 justify-between gap-2 px-3"
      aria-label="Edit Program Profile"
      onClick={onClick}
    >
      <span className="truncate">{programProfileLabel(profile, programs)}</span>
      <ChevronDown aria-hidden="true" />
    </Button>
  );
}
