import { describe, expect, it } from "vitest";
import { assertCorrectionTransition, canStudentWithdraw, CorrectionOverlayInputSchema, CorrectionPolicyError } from "@/lib/corrections/policy";

describe("correction policy", () => {
  it.each([["submitted", "in_review"], ["in_review", "approved"], ["approved", "applied"], ["rejected", "in_review"]] as const)("allows %s to %s", (from, to) => expect(() => assertCorrectionTransition(from, to)).not.toThrow());
  it("requires public context for needs-information and rejection", () => {
    expect(() => assertCorrectionTransition("in_review", "needs_information")).toThrow(CorrectionPolicyError);
    expect(() => assertCorrectionTransition("submitted", "rejected", "Duplicate source report")).not.toThrow();
  });
  it("keeps applied terminal and rejects graph shortcuts", () => {
    expect(() => assertCorrectionTransition("applied", "in_review")).toThrow();
    expect(() => assertCorrectionTransition("submitted", "approved")).toThrow();
  });
  it("allows owner withdrawal only before review completion", () => {
    expect(canStudentWithdraw("submitted", null)).toBe(true);
    expect(canStudentWithdraw("needs_information", null)).toBe(true);
    expect(canStudentWithdraw("in_review", null)).toBe(false);
    expect(canStudentWithdraw("submitted", new Date())).toBe(false);
  });
  it("accepts only allowlisted course fields and valid credit ranges", () => {
    expect(CorrectionOverlayInputSchema.safeParse({ kind: "course", stableId: "source:id", changes: { title: "Correct title", minCredits: 2, maxCredits: 4 } }).success).toBe(true);
    expect(CorrectionOverlayInputSchema.safeParse({ kind: "course", stableId: "source:id", changes: { sourceId: "attacker" } }).success).toBe(false);
    expect(CorrectionOverlayInputSchema.safeParse({ kind: "course", stableId: "source:id", changes: { minCredits: 5, maxCredits: 2 } }).success).toBe(false);
  });
  it("requires typed requirement action data", () => {
    expect(CorrectionOverlayInputSchema.safeParse({ kind: "requirement", programId: "cs", requirementId: "elective", action: "note", note: "Reviewed explanation" }).success).toBe(true);
    expect(CorrectionOverlayInputSchema.safeParse({ kind: "requirement", programId: "cs", requirementId: "elective", action: "add_fulfillment" }).success).toBe(false);
  });

  it("rejects requirement overlays that cross the verified trust boundary", () => {
    const category = (name: string, requirement: unknown) => ({
      kind: "requirement-upsert",
      programId: "data-science-bs",
      category: {
        id: "probability",
        name,
        requirement,
        sourceUrl:
          "https://bulletins.nyu.edu/undergraduate/shanghai/programs/data-science-bs/",
        sourceTableId: "probability",
        sourceRowIndexes: [0, 1, 2],
      },
    });

    expect(
      CorrectionOverlayInputSchema.safeParse(
        category("Course List", { kind: "course", courseId: "MATH-SHU 235" }),
      ).success,
    ).toBe(false);
    expect(
      CorrectionOverlayInputSchema.safeParse(
        category("Probability", {
          kind: "manualConfirmation",
          label: "Probability",
          sourceText: "Select one of the following:",
        }),
      ).success,
    ).toBe(false);
    expect(
      CorrectionOverlayInputSchema.safeParse(
        category("Probability", {
          kind: "choose",
          count: 2,
          children: [{ kind: "course", courseId: "MATH-SHU 235" }],
        }),
      ).success,
    ).toBe(false);
  });
});
