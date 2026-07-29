import { z } from "zod";

const HeadingLevelSchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export const BulletinDiagnosticSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    tableId: z.string().min(1).optional(),
    sourceIndex: z.number().int().nonnegative().optional(),
  })
  .strict();
export type BulletinDiagnostic = z.infer<typeof BulletinDiagnosticSchema>;

export const BulletinDisplayRowSchema = z
  .object({
    sourceIndex: z.number().int().nonnegative(),
    role: z.enum(["heading", "directive", "course", "note", "total"]),
    text: z.string().min(1),
    creditsText: z.string().min(1).nullable(),
    linkedCourseCodes: z.array(z.string().min(1)),
    sourceAnchors: z.array(z.string().min(1)),
    footnoteMarkers: z.array(z.string().min(1)),
  })
  .strict();
export type BulletinDisplayRow = z.infer<typeof BulletinDisplayRowSchema>;

export const BulletinHeadingBlockSchema = z
  .object({
    kind: z.literal("heading"),
    level: HeadingLevelSchema,
    text: z.string().min(1),
  })
  .strict();

export const BulletinProseBlockSchema = z
  .object({
    kind: z.literal("prose"),
    paragraphs: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const BulletinTableBlockSchema = z
  .object({
    kind: z.literal("table"),
    id: z.string().min(1),
    caption: z.string().min(1).nullable(),
    headingTrail: z.array(
      z
        .object({
          level: HeadingLevelSchema,
          text: z.string().min(1),
        })
        .strict(),
    ),
    rows: z.array(BulletinDisplayRowSchema),
  })
  .strict();
export type BulletinTableBlock = z.infer<typeof BulletinTableBlockSchema>;

export const BulletinRequirementDocumentSchema = z
  .object({
    schemaVersion: z.literal(2),
    sourceUrl: z.string().url(),
    sections: z.array(
      z
        .object({
          id: z.string().min(1),
          heading: z.string(),
          blocks: z.array(
            z.discriminatedUnion("kind", [
              BulletinHeadingBlockSchema,
              BulletinProseBlockSchema,
              BulletinTableBlockSchema,
            ]),
          ),
        })
        .strict(),
    ),
  })
  .strict();
export type BulletinRequirementDocument = z.infer<
  typeof BulletinRequirementDocumentSchema
>;

export const BulletinSamplePlanRowSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("course"),
      sourceIndex: z.number().int().nonnegative(),
      text: z.string().min(1),
      creditsText: z.string().min(1).nullable(),
      linkedCourseCodes: z.array(z.string().min(1)).min(1),
      sourceAnchors: z.array(z.string().min(1)),
    })
    .strict(),
  z
    .object({
      kind: z.literal("placeholder"),
      sourceIndex: z.number().int().nonnegative(),
      label: z.string().min(1),
      creditsText: z.string().min(1).nullable(),
    })
    .strict(),
]);
export type BulletinSamplePlanRow = z.infer<
  typeof BulletinSamplePlanRowSchema
>;

export const BulletinSamplePlanTermSchema = z
  .object({
    sourceIndex: z.number().int().nonnegative(),
    heading: z.string().min(1),
    ordinal: z.number().int().positive().nullable(),
    creditsText: z.string().min(1).nullable(),
    rows: z.array(BulletinSamplePlanRowSchema),
  })
  .strict();
export type BulletinSamplePlanTerm = z.infer<
  typeof BulletinSamplePlanTermSchema
>;

export const BulletinSamplePlanSchema = z
  .object({
    sectionId: z.string().min(1),
    heading: z.string().min(1),
    terms: z.array(BulletinSamplePlanTermSchema).min(1),
    totalCreditsText: z.string().min(1).nullable(),
    importStatus: z.enum(["eligible", "display-only"]),
    diagnostics: z.array(BulletinDiagnosticSchema),
  })
  .strict();
export type BulletinSamplePlan = z.infer<typeof BulletinSamplePlanSchema>;
