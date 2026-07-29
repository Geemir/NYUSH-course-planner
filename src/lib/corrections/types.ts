import { z } from "zod";

export const CorrectionStatusSchema = z.enum([
  "submitted", "in_review", "needs_information", "approved", "rejected", "applied",
]);
export type CorrectionStatus = z.infer<typeof CorrectionStatusSchema>;

export const CorrectionTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("course"), stableId: z.string().min(1).max(300) }).strict(),
  z.object({ kind: z.literal("requirement"), programId: z.string().min(1).max(200), requirementId: z.string().min(1).max(300) }).strict(),
  z.object({ kind: z.literal("program"), programId: z.string().min(1).max(200) }).strict(),
  z.object({ kind: z.literal("other"), area: z.string().trim().min(1).max(80) }).strict(),
]);
export type CorrectionTarget = z.infer<typeof CorrectionTargetSchema>;

export const CorrectionIssueTypeSchema = z.enum([
  "incorrect_course_information",
  "missing_course",
  "incorrect_nyush_requirement",
  "nyush_fulfillment_review",
  "duplicate_crosslist_equivalency",
  "other_catalog_problem",
]);
export type CorrectionIssueType = z.infer<typeof CorrectionIssueTypeSchema>;

const HttpsUrlSchema = z.string().url().refine((url) => url.startsWith("https://"), "HTTPS URL required");

export const CorrectionContextSchema = z.object({
  sourceId: z.string().min(1).max(200).optional(),
  sourceSnapshotId: z.string().min(1).max(300).optional(),
  schoolName: z.string().max(160).optional(),
  sourceUrl: HttpsUrlSchema.optional(),
  displayedValue: z.string().max(4000).optional(),
  tableId: z.string().min(1).max(300).optional(),
  sourceIndex: z.number().int().nonnegative().optional(),
}).strict();

export const CreateCorrectionRequestSchema = z.object({
  target: CorrectionTargetSchema,
  issueType: CorrectionIssueTypeSchema,
  catalogReleaseId: z.string().min(1).max(300).nullable(),
  context: CorrectionContextSchema,
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(20).max(4000),
  suggestedCorrection: z.string().trim().max(4000).optional(),
  evidenceUrl: HttpsUrlSchema.optional(),
}).strict();
export type CreateCorrectionRequest = z.infer<typeof CreateCorrectionRequestSchema>;

export const CorrectionMessageInputSchema = z.object({ body: z.string().trim().min(1).max(4000) }).strict();

export interface CorrectionMessageDto {
  id: string;
  body: string;
  author: "student" | "maintainer";
  createdAt: string;
}

export interface CorrectionEventDto {
  id: string;
  eventType: string;
  fromStatus: CorrectionStatus | null;
  toStatus: CorrectionStatus | null;
  publicNote: string | null;
  createdAt: string;
}

export interface StudentCorrectionSummary {
  id: string;
  target: CorrectionTarget;
  issueType: CorrectionIssueType;
  title: string;
  status: CorrectionStatus;
  withdrawnAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudentCorrectionDetail extends StudentCorrectionSummary {
  catalogReleaseId: string | null;
  context: z.infer<typeof CorrectionContextSchema>;
  description: string;
  suggestedCorrection: string | null;
  evidenceUrl: string | null;
  messages: CorrectionMessageDto[];
  events: CorrectionEventDto[];
}

export interface AdminCorrectionDetail extends StudentCorrectionDetail {
  ownerUserId: string;
  assignedTo: string | null;
  duplicateOfId: string | null;
  privateEvents: Array<CorrectionEventDto & { privateNote: string | null; actorUserId: string | null }>;
}
