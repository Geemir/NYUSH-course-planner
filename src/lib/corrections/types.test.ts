import { describe, expect, it } from "vitest";
import { CreateCorrectionRequestSchema, CorrectionTargetSchema } from "@/lib/corrections/types";

const input = { target: { kind: "course", stableId: "stern:TEST-UA 1" }, issueType: "incorrect_course_information", catalogReleaseId: "release", context: { sourceId: "stern", sourceSnapshotId: "snapshot", schoolName: "NYU Stern", sourceUrl: "https://bulletins.nyu.edu/", displayedValue: "Current value", tableId: "course-list", sourceIndex: 3 }, title: "Wrong course description", description: "The displayed description differs from the linked Bulletin source.", evidenceUrl: "https://bulletins.nyu.edu/evidence" };

describe("correction contracts", () => {
  it.each([
    { kind: "course", stableId: "source:course" },
    { kind: "requirement", programId: "cs", requirementId: "core" },
    { kind: "program", programId: "cs" },
    { kind: "other", area: "Planner behavior" },
  ])("accepts target $kind", (target) => expect(CorrectionTargetSchema.parse(target)).toEqual(target));

  it("captures immutable release and source-row context", () => expect(CreateCorrectionRequestSchema.parse(input)).toMatchObject({ catalogReleaseId: "release", context: { sourceSnapshotId: "snapshot", tableId: "course-list", sourceIndex: 3 } }));
  it("requires HTTPS evidence and source URLs", () => {
    expect(CreateCorrectionRequestSchema.safeParse({ ...input, evidenceUrl: "http://example.com" }).success).toBe(false);
    expect(CreateCorrectionRequestSchema.safeParse({ ...input, context: { ...input.context, sourceUrl: "http://example.com" } }).success).toBe(false);
  });
  it("enforces text boundaries and rejects unknown keys", () => {
    expect(CreateCorrectionRequestSchema.safeParse({ ...input, title: "bad" }).success).toBe(false);
    expect(CreateCorrectionRequestSchema.safeParse({ ...input, description: "x".repeat(4001) }).success).toBe(false);
    expect(CreateCorrectionRequestSchema.safeParse({ ...input, context: { displayedValue: "x".repeat(4001) } }).success).toBe(false);
    expect(CreateCorrectionRequestSchema.safeParse({ ...input, ownerId: "attacker" }).success).toBe(false);
  });
  it("preserves untrusted text as inert serialized data", () => {
    const parsed = CreateCorrectionRequestSchema.parse({ ...input, description: "<script>alert('x')</script> remains plain report text" });
    expect(JSON.parse(JSON.stringify(parsed)).description).toContain("<script>");
  });
});
