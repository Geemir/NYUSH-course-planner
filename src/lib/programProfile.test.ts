import { describe, expect, it } from "vitest";
import {
  ProgramProfileSchema,
  activeProgramIds,
  validateProgramProfile,
} from "@/lib/programProfile";
import type { CatalogProgram } from "@/lib/types";

function program(
  id: string,
  type: "core" | "major" | "minor",
  auditAuthority: CatalogProgram["auditAuthority"] = "nyush-bulletin",
  eligibleProfileRoles?: CatalogProgram["eligibleProfileRoles"],
): CatalogProgram {
  return {
    id,
    name: id,
    shortName: id,
    type,
    categories: [],
    requirementRows: [],
    sourceRows: [],
    sourceReferenceIds: [],
    provenance: {
      sourceUrl: "https://bulletins.nyu.edu/undergraduate/shanghai/",
      snapshotId: "snapshot",
      sourceHash: "hash",
    },
    auditAuthority,
    eligibleProfileRoles: eligibleProfileRoles ?? (
      type === "core" ? ["core"] : type === "minor" ? ["minor"] : ["primaryMajor", "secondMajor"]
    ),
  };
}

const programs = [
  program("core", "core"),
  program("cs", "major"),
  program("ds", "major"),
  program("ima-minor", "minor"),
  program("reviewed-minor", "minor", "reviewed-nyush-overlay", ["minor"]),
  program("raw-ny", "major", "raw-nyu-bulletin", []),
];

describe("ProgramProfile", () => {
  it("parses structure without catalog data and applies optional defaults", () => {
    expect(ProgramProfileSchema.parse({ coreProgramId: "core", primaryMajorId: "cs" })).toEqual({
      coreProgramId: "core",
      primaryMajorId: "cs",
      secondMajorId: null,
      minorIds: [],
    });
  });

  it("accepts NYUSH roles and an explicitly reviewed overlay minor", () => {
    const result = validateProgramProfile({
      coreProgramId: "core",
      primaryMajorId: "cs",
      secondMajorId: "ds",
      minorIds: ["ima-minor", "reviewed-minor"],
    }, programs);
    expect(result.status).toBe("valid");
    expect(result.issues).toEqual([]);
  });

  it("rejects raw New York programs and role mismatches using explicit metadata", () => {
    const result = validateProgramProfile({
      coreProgramId: "core",
      primaryMajorId: "raw-ny",
      secondMajorId: "ima-minor",
      minorIds: ["cs"],
    }, programs);
    expect(result.status).toBe("needs-resolution");
    expect(result.issues.map((issue) => [issue.field, issue.code, issue.programId])).toEqual([
      ["primaryMajor", "wrong-kind", "raw-ny"],
      ["secondMajor", "wrong-kind", "ima-minor"],
      ["minors", "wrong-kind", "cs"],
    ]);
  });

  it("reports duplicates, deduplicates minors in first-seen order, and preserves unresolved IDs", () => {
    const result = validateProgramProfile({
      coreProgramId: "core",
      primaryMajorId: "cs",
      secondMajorId: "cs",
      minorIds: ["ima-minor", "missing-minor", "ima-minor", "cs"],
    }, programs);
    expect(result.normalized.minorIds).toEqual(["ima-minor", "missing-minor", "cs"]);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "secondMajor", code: "duplicate", programId: "cs" }),
      expect.objectContaining({ field: "minors", code: "unresolved", programId: "missing-minor" }),
      expect.objectContaining({ field: "minors", code: "duplicate", programId: "ima-minor" }),
      expect.objectContaining({ field: "minors", code: "duplicate", programId: "cs" }),
    ]));
  });

  it("keeps deterministic engine order while removing duplicates", () => {
    expect(activeProgramIds({
      coreProgramId: "core",
      primaryMajorId: "cs",
      secondMajorId: "cs",
      minorIds: ["ima-minor", "core", "reviewed-minor"],
    })).toEqual(["core", "cs", "ima-minor", "reviewed-minor"]);
  });
});
