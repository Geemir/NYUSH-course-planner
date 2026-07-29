import { z } from "zod";
import { CatalogCategorySchema, CatalogProgramSchema } from "@/lib/types";
import type { CorrectionStatus } from "@/lib/corrections/types";

export const ALLOWED_CORRECTION_TRANSITIONS: Readonly<Record<CorrectionStatus, readonly CorrectionStatus[]>> = {
  submitted: ["in_review", "rejected"],
  in_review: ["needs_information", "approved", "rejected"],
  needs_information: ["in_review", "rejected"],
  approved: ["applied", "in_review"],
  rejected: ["in_review"],
  applied: [],
};

export class CorrectionPolicyError extends Error {
  constructor(message: string) { super(message); this.name = "CorrectionPolicyError"; }
}

export function assertCorrectionTransition(
  from: CorrectionStatus,
  to: CorrectionStatus,
  publicNote?: string | null,
): void {
  if (!ALLOWED_CORRECTION_TRANSITIONS[from].includes(to)) {
    throw new CorrectionPolicyError(`Cannot transition correction from ${from} to ${to}.`);
  }
  if ((to === "needs_information" || to === "rejected") && !publicNote?.trim()) {
    throw new CorrectionPolicyError(`${to} requires a public reason.`);
  }
}

export function canStudentWithdraw(status: CorrectionStatus, withdrawnAt: Date | string | null): boolean {
  return withdrawnAt === null && (status === "submitted" || status === "needs_information");
}

const CourseChangesSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(8000).optional(),
  minCredits: z.number().nonnegative().max(30).optional(),
  maxCredits: z.number().nonnegative().max(30).optional(),
  attributes: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  prerequisiteText: z.string().trim().max(4000).optional(),
  crossListedStableIds: z.array(z.string().min(1).max(300)).max(50).optional(),
  catalogOfferingTerms: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  catalogOfferingText: z.string().trim().min(1).max(1000).nullable().optional(),
  offered: z.array(z.enum(["fall", "spring"])).optional(),
  offeringText: z.string().trim().min(1).max(1000).nullable().optional(),
  offeringKnown: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one course field is required").refine(
  (value) => value.minCredits === undefined || value.maxCredits === undefined || value.minCredits <= value.maxCredits,
  "Minimum credits cannot exceed maximum credits",
);

const ReviewedProgramSchema = CatalogProgramSchema.refine(
  (program) => program.auditAuthority === "reviewed-nyush-overlay",
  "Reviewed programs must use reviewed overlay authority",
).refine(
  (program) => program.eligibleProfileRoles.length > 0 && program.categories.length > 0 && program.sourceReferenceIds.length > 0,
  "Reviewed programs require roles, executable requirements, and sources",
);

export const CorrectionOverlayInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("course"), stableId: z.string().min(1), changes: CourseChangesSchema }).strict(),
  z.object({ kind: z.literal("course-delete"), stableId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("requirement-upsert"), programId: z.string().min(1), category: CatalogCategorySchema }).strict(),
  z.object({ kind: z.literal("requirement-delete"), programId: z.string().min(1), categoryId: z.string().min(1) }).strict(),
  z.object({
    kind: z.literal("requirement"), programId: z.string().min(1), requirementId: z.string().min(1),
    action: z.enum(["add_fulfillment", "remove_fulfillment", "exclude_course", "note"]),
    courseStableId: z.string().min(1).optional(), note: z.string().trim().min(1).max(4000).optional(),
  }).strict().refine((value) => value.action === "note" ? Boolean(value.note) : Boolean(value.courseStableId), "Action data is required"),
  z.object({ kind: z.literal("program-note"), programId: z.string().min(1), note: z.string().trim().min(1).max(4000), sourceUrl: z.string().url().refine((url) => url.startsWith("https://")) }).strict(),
  z.object({ kind: z.literal("reviewed-program"), program: ReviewedProgramSchema }).strict(),
]);
export type CorrectionOverlayInput = z.infer<typeof CorrectionOverlayInputSchema>;
