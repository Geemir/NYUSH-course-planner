"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { validateProgramProfile, type ProgramProfile } from "@/lib/programProfile";
import type { CatalogProgram, CatalogProgramProfileRole } from "@/lib/types";

interface ProgramProfileSheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  programs: CatalogProgram[];
  profile: ProgramProfile;
  onSave(profile: ProgramProfile): void;
}

function eligible(program: CatalogProgram, role: CatalogProgramProfileRole) {
  if (program.auditAuthority === "raw-nyu-bulletin") return false;
  if (!program.eligibleProfileRoles.includes(role)) return false;
  return role !== "primaryMajor" || program.auditAuthority === "nyush-bulletin";
}

function ProgramSource({ program }: { program: CatalogProgram }) {
  if (program.auditAuthority !== "reviewed-nyush-overlay") return null;
  return <Badge variant="outline">Reviewed planner overlay</Badge>;
}

function RequirementPreview({ program }: { program?: CatalogProgram }) {
  if (!program) return null;
  return (
    <div className="mt-2 text-xs leading-5 text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <span>{program.categories.length} requirement group{program.categories.length === 1 ? "" : "s"}</span>
        <ProgramSource program={program} />
      </div>
      {program.categories.length > 0 && (
        <p className="line-clamp-2">{program.categories.map((category) => category.name).join(" · ")}</p>
      )}
    </div>
  );
}

function RoleSelect({
  label,
  value,
  options,
  allowNone = false,
  onChange,
}: {
  label: string;
  value: string | null;
  options: CatalogProgram[];
  allowNone?: boolean;
  onChange(value: string | null): void;
}) {
  const selected = options.find((program) => program.id === value);
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <select
        className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        {allowNone && <option value="">None</option>}
        {!allowNone && value === "" && <option value="">Select a program</option>}
        {options.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
      </select>
      <RequirementPreview program={selected} />
    </label>
  );
}

function ProgramProfileSheetEditor({
  open,
  onOpenChange,
  programs,
  profile,
  onSave,
}: ProgramProfileSheetProps) {
  const [draft, setDraft] = useState(profile);
  const [query, setQuery] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? programs.filter((program) => `${program.name} ${program.shortName}`.toLowerCase().includes(term)) : programs;
  }, [programs, query]);
  const cores = filtered.filter((program) => eligible(program, "core"));
  const primaryMajors = filtered.filter((program) => eligible(program, "primaryMajor"));
  const secondMajors = filtered.filter((program) => eligible(program, "secondMajor") && program.id !== draft.primaryMajorId);
  const minors = filtered.filter((program) => eligible(program, "minor") && ![draft.coreProgramId, draft.primaryMajorId, draft.secondMajorId].includes(program.id));
  const validation = validateProgramProfile(draft, programs);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);
  const needsGuidance = Boolean(draft.secondMajorId) || [...draft.minorIds, draft.secondMajorId].filter(Boolean).some((id) => programs.find((program) => program.id === id)?.auditAuthority === "reviewed-nyush-overlay");
  const canSave = validation.status === "valid" && (!needsGuidance || acknowledged);
  const beforeGroups = programs.filter((program) => [profile.coreProgramId, profile.primaryMajorId, profile.secondMajorId, ...profile.minorIds].includes(program.id)).reduce((sum, program) => sum + program.categories.length, 0);
  const afterGroups = programs.filter((program) => [draft.coreProgramId, draft.primaryMajorId, draft.secondMajorId, ...draft.minorIds].includes(program.id)).reduce((sum, program) => sum + program.categories.length, 0);

  const requestOpenChange = (next: boolean) => {
    if (!next && dirty && !window.confirm("Discard unsaved Program Profile changes?")) return;
    onOpenChange(next);
  };

  return (
    <Sheet open={open} onOpenChange={requestOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Program Profile</SheetTitle>
          <SheetDescription>Choose the NYUSH programs whose requirements you want to plan. This is planning guidance, not an official degree audit.</SheetDescription>
        </SheetHeader>

        <label className="relative block">
          <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" aria-hidden="true" />
          <Input className="h-11 pl-9" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search majors and minors" aria-label="Search programs" />
        </label>

        <div className="space-y-6">
          <section aria-labelledby="core-program-heading">
            <h3 id="core-program-heading" className="text-sm font-semibold">Core Curriculum</h3>
            <p className="mb-2 text-xs text-muted-foreground">Always active for NYU Shanghai students.</p>
            <RoleSelect label="NYUSH Core" value={draft.coreProgramId} options={cores} onChange={(coreProgramId) => coreProgramId && setDraft((current) => ({ ...current, coreProgramId }))} />
          </section>

          <section className="space-y-5" aria-labelledby="majors-heading">
            <h3 id="majors-heading" className="text-sm font-semibold">Majors</h3>
            <RoleSelect label="Primary major" value={draft.primaryMajorId} options={primaryMajors} onChange={(primaryMajorId) => primaryMajorId && setDraft((current) => ({ ...current, primaryMajorId, secondMajorId: current.secondMajorId === primaryMajorId ? null : current.secondMajorId }))} />
            <RoleSelect label="Second major (optional)" value={draft.secondMajorId} options={secondMajors} allowNone onChange={(secondMajorId) => setDraft((current) => ({ ...current, secondMajorId }))} />
          </section>

          <section aria-labelledby="minors-heading">
            <h3 id="minors-heading" className="text-sm font-semibold">Minors</h3>
            <div className="mt-2 divide-y rounded-lg border">
              {minors.map((program) => {
                const checked = draft.minorIds.includes(program.id);
                return (
                  <label key={program.id} className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                    <Checkbox checked={checked} onCheckedChange={() => setDraft((current) => ({ ...current, minorIds: checked ? current.minorIds.filter((id) => id !== program.id) : [...current.minorIds, program.id] }))} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{program.name}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {program.categories.length} requirement groups <ProgramSource program={program} />
                      </span>
                    </span>
                  </label>
                );
              })}
              {minors.length === 0 && <p className="p-3 text-sm text-muted-foreground">No eligible minors match this search.</p>}
            </div>
          </section>
        </div>

        <div className="rounded-lg bg-muted p-3 text-sm">
          <p className="font-medium">Requirement impact</p>
          <p className="mt-1 text-muted-foreground">Tracked requirement groups: {beforeGroups} → {afterGroups}</p>
        </div>

        {validation.issues.length > 0 && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {validation.issues.map((issue) => <p key={`${issue.field}:${issue.programId}`}>{issue.message}</p>)}
          </div>
        )}

        {needsGuidance && (
          <label className="flex gap-3 rounded-lg border p-3 text-sm">
            <Checkbox checked={acknowledged} onCheckedChange={(value) => setAcknowledged(Boolean(value))} />
            <span>
              <span className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" aria-hidden="true" />Advisor review may be needed</span>
              <span className="mt-1 block text-muted-foreground">I understand that double-major and reviewed-overlay combinations may require advisor confirmation.</span>
            </span>
          </label>
        )}

        <div className="sticky bottom-0 -mx-4 mt-auto flex justify-end gap-2 border-t bg-background px-4 pt-4 pb-1">
          <Button variant="outline" onClick={() => requestOpenChange(false)}>Cancel</Button>
          <Button disabled={!dirty || !canSave} onClick={() => { onSave(validation.normalized); onOpenChange(false); }}>Save Program Profile</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ProgramProfileSheet(props: ProgramProfileSheetProps) {
  return (
    <ProgramProfileSheetEditor
      key={`${props.open}:${JSON.stringify(props.profile)}`}
      {...props}
    />
  );
}
