import { z } from "zod";
import { CourseSchema, type CatalogProgram } from "@/lib/types";

export const CatalogCampusSchema = z.enum(["shanghai", "new-york"]);
export type CatalogCampus = z.infer<typeof CatalogCampusSchema>;

export const CatalogSourceDefinitionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    schoolName: z.string().min(1),
    campus: CatalogCampusSchema,
    bulletinRoot: z.string().url(),
    courseIndexUrl: z.string().url(),
    includePrograms: z.boolean(),
    enabled: z.boolean(),
  })
  .strict();
export type CatalogSourceDefinition = z.infer<
  typeof CatalogSourceDefinitionSchema
>;

export const CatalogCourseRecordSchema = z
  .object({
    stableId: z.string().min(1),
    sourceId: z.string().min(1),
    sourceSnapshotId: z.string().min(1),
    code: z.string().min(1),
    subject: z.string().min(1),
    level: z.enum(["undergraduate", "graduate", "ambiguous"]),
    catalogOfferingTerms: z.array(z.string().min(1)),
    catalogOfferingText: z.string().min(1).nullable(),
    course: CourseSchema,
    crossListedStableIds: z.array(z.string().min(1)),
  })
  .strict();
export type CatalogCourseRecord = z.infer<typeof CatalogCourseRecordSchema>;

export interface SourceCatalogCandidate {
  sourceId: string;
  snapshotId: string;
  sourceHash: string;
  documents: unknown[];
  courses: CatalogCourseRecord[];
  programs: CatalogProgram[];
  quarantinedCourses: Array<{
    code: string;
    reason: string;
    sourceUrl: string;
  }>;
  sourceReferenceIds: string[];
  unresolvedCourseIds: string[];
}

export const CatalogReleaseRefSchema = z
  .object({
    id: z.string().min(1),
    sourceSnapshotIds: z.record(z.string().min(1), z.string().min(1)),
    publishedAt: z.iso.datetime(),
  })
  .strict()
  .refine((release) => Object.keys(release.sourceSnapshotIds).length > 0, {
    message: "A catalog release must include at least one source snapshot",
    path: ["sourceSnapshotIds"],
  });
export type CatalogReleaseRef = z.infer<typeof CatalogReleaseRefSchema>;
