"use client";

import { useMemo, useState } from "react";
import { Archive, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { validateProgramProfile, type ProgramProfile } from "@/lib/programProfile";
import type { PlanMigrationIssue, PlanMigrationResult } from "@/lib/planMigration";
import type { CatalogProgram, CatalogProgramProfileRole } from "@/lib/types";

interface ProgramProfileMigrationDialogProps {
  open: boolean;
  result: PlanMigrationResult;
  programs: CatalogProgram[];
  onCancel(): void;
  onContinue(result: PlanMigrationResult): void;
  onExportBackup(): void;
}

const PROFILE_ISSUES = new Set<PlanMigrationIssue["code"]>([
  "confirm-double-major",
  "missing-core",
  "missing-primary-major",
  "too-many-majors",
  "duplicate-program",
  "invalid-profile",
]);

function optionsFor(programs: CatalogProgram[], role: CatalogProgramProfileRole) {
  return programs.filter((program) =>
    program.auditAuthority !== "raw-nyu-bulletin" &&
    program.eligibleProfileRoles.includes(role) &&
    (role !== "primaryMajor" || program.auditAuthority === "nyush-bulletin"),
  );
}

function MigrationEditor({
  open,
  result,
  programs,
  onCancel,
  onContinue,
  onExportBackup,
}: ProgramProfileMigrationDialogProps) {
  const [profile, setProfile] = useState<ProgramProfile>(result.snapshot.programProfile);
  const [keepUnresolved, setKeepUnresolved] = useState(result.snapshot.unresolvedProgramIds.length === 0);
  const validation = validateProgramProfile(profile, programs);
  const primary = optionsFor(programs, "primaryMajor");
  const second = optionsFor(programs, "secondMajor").filter((program) => program.id !== profile.primaryMajorId);
  const minors = optionsFor(programs, "minor").filter((program) => ![profile.coreProgramId, profile.primaryMajorId, profile.secondMajorId].includes(program.id));

  const resolved = useMemo<PlanMigrationResult>(() => {
    const issues = result.issues.map((issue) => {
      if (PROFILE_ISSUES.has(issue.code)) return { ...issue, blocking: false };
      if (issue.code === "unresolved-program" && keepUnresolved) return { ...issue, blocking: false };
      return issue;
    });
    validation.issues.forEach((issue) => issues.push({
      code: "invalid-profile",
      value: issue.programId ?? undefined,
      message: issue.message,
      blocking: true,
    }));
    return {
      snapshot: { ...result.snapshot, programProfile: validation.normalized },
      issues,
      status: issues.some((issue) => issue.blocking) ? "needs-resolution" : "ready",
    };
  }, [keepUnresolved, result, validation]);

  return (
    <Dialog open={open}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Review your updated Program Profile</DialogTitle>
          <DialogDescription>
            The planner now separates your primary major, optional second major, and minors. Your courses and custom records remain intact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block text-sm font-medium">
            Primary major
            <select className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal" value={profile.primaryMajorId} onChange={(event) => setProfile((current) => ({ ...current, primaryMajorId: event.target.value, secondMajorId: current.secondMajorId === event.target.value ? null : current.secondMajorId }))}>
              {primary.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Second major (optional)
            <select className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal" value={profile.secondMajorId ?? ""} onChange={(event) => setProfile((current) => ({ ...current, secondMajorId: event.target.value || null }))}>
              <option value="">None</option>
              {second.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
            </select>
          </label>
          {minors.length > 0 && (
            <fieldset>
              <legend className="text-sm font-medium">Minors</legend>
              <div className="mt-1.5 divide-y rounded-lg border">
                {minors.map((program) => {
                  const checked = profile.minorIds.includes(program.id);
                  return (
                    <label key={program.id} className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">
                      <Checkbox checked={checked} onCheckedChange={() => setProfile((current) => ({ ...current, minorIds: checked ? current.minorIds.filter((id) => id !== program.id) : [...current.minorIds, program.id] }))} />
                      <span className="flex-1">{program.name}</span>
                      {program.auditAuthority === "reviewed-nyush-overlay" && <Badge variant="outline">Reviewed planner overlay</Badge>}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>

        {result.snapshot.unresolvedProgramIds.length > 0 && (
          <div className="rounded-lg border p-3 text-sm">
            <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" aria-hidden="true" />Needs review</p>
            <ul className="my-2 list-disc pl-5 text-muted-foreground">
              {result.snapshot.unresolvedProgramIds.map((id) => <li key={id}>{id}</li>)}
            </ul>
            <label className="flex gap-3">
              <Checkbox checked={keepUnresolved} onCheckedChange={(value) => setKeepUnresolved(Boolean(value))} />
              <span>Keep these unresolved references in the plan for later review.</span>
            </label>
          </div>
        )}

        {resolved.issues.filter((issue) => issue.blocking).map((issue) => (
          <p key={`${issue.code}:${issue.value}`} role="alert" className="text-sm text-destructive">{issue.message}</p>
        ))}

        <DialogFooter className="flex-wrap">
          <Button variant="outline" onClick={onExportBackup}><Archive aria-hidden="true" />Export backup</Button>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button disabled={resolved.status !== "ready"} onClick={() => onContinue(resolved)}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProgramProfileMigrationDialog(props: ProgramProfileMigrationDialogProps) {
  return <MigrationEditor key={`${props.open}:${JSON.stringify(props.result.snapshot)}`} {...props} />;
}
