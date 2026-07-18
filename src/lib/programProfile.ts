import { z } from "zod";
import type { CatalogProgram, CatalogProgramProfileRole } from "@/lib/types";

export const ProgramProfileSchema = z.object({
  coreProgramId: z.string().min(1),
  primaryMajorId: z.string().min(1),
  secondMajorId: z.string().min(1).nullable().default(null),
  minorIds: z.array(z.string().min(1)).default([]),
}).strict();
export type ProgramProfile = z.infer<typeof ProgramProfileSchema>;

export interface ProgramProfileIssue {
  field: "core" | "primaryMajor" | "secondMajor" | "minors";
  code: "missing" | "wrong-kind" | "duplicate" | "unresolved";
  programId: string | null;
  message: string;
}

export interface ProgramProfileValidation {
  status: "valid" | "needs-resolution";
  normalized: ProgramProfile;
  issues: ProgramProfileIssue[];
}

function eligible(
  program: CatalogProgram,
  type: CatalogProgram["type"],
  role: CatalogProgramProfileRole,
  requireNyushBulletin = false,
): boolean {
  if (program.type !== type || !program.eligibleProfileRoles.includes(role)) return false;
  if (program.auditAuthority === "raw-nyu-bulletin") return false;
  return !requireNyushBulletin || program.auditAuthority === "nyush-bulletin";
}

export function validateProgramProfile(
  input: ProgramProfile,
  programs: CatalogProgram[],
): ProgramProfileValidation {
  const profile = ProgramProfileSchema.parse(input);
  const byId = new Map(programs.map((program) => [program.id, program]));
  const issues: ProgramProfileIssue[] = [];
  const normalizedMinorIds: string[] = [];
  const seenMinors = new Set<string>();

  const check = (
    field: ProgramProfileIssue["field"],
    id: string | null,
    type: CatalogProgram["type"],
    role: CatalogProgramProfileRole,
    requireNyushBulletin = false,
  ) => {
    if (!id) {
      issues.push({ field, code: "missing", programId: null, message: `${field} is required.` });
      return;
    }
    const program = byId.get(id);
    if (!program) {
      issues.push({ field, code: "unresolved", programId: id, message: `${id} is not present in the active catalog.` });
    } else if (!eligible(program, type, role, requireNyushBulletin)) {
      issues.push({ field, code: "wrong-kind", programId: id, message: `${id} is not eligible for ${field}.` });
    }
  };

  check("core", profile.coreProgramId, "core", "core", true);
  check("primaryMajor", profile.primaryMajorId, "major", "primaryMajor", true);
  if (profile.secondMajorId) {
    if (profile.secondMajorId === profile.primaryMajorId) {
      issues.push({ field: "secondMajor", code: "duplicate", programId: profile.secondMajorId, message: "Primary and second major must be distinct." });
    } else {
      check("secondMajor", profile.secondMajorId, "major", "secondMajor");
    }
  }

  profile.minorIds.forEach((id) => {
    if (seenMinors.has(id)) {
      issues.push({ field: "minors", code: "duplicate", programId: id, message: `${id} is listed more than once.` });
      return;
    }
    seenMinors.add(id);
    normalizedMinorIds.push(id);
    if (id === profile.primaryMajorId || id === profile.secondMajorId || id === profile.coreProgramId) {
      issues.push({ field: "minors", code: "duplicate", programId: id, message: `${id} is already selected in another role.` });
      return;
    }
    check("minors", id, "minor", "minor");
  });

  return {
    status: issues.length ? "needs-resolution" : "valid",
    normalized: { ...profile, minorIds: normalizedMinorIds },
    issues,
  };
}

export function activeProgramIds(profile: ProgramProfile): string[] {
  const ordered = [
    profile.coreProgramId,
    profile.primaryMajorId,
    ...(profile.secondMajorId ? [profile.secondMajorId] : []),
    ...profile.minorIds,
  ];
  return ordered.filter((id, index) => ordered.indexOf(id) === index);
}
