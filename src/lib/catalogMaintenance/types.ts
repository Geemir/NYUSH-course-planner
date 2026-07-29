import { z } from "zod";
import { CorrectionOverlayInputSchema } from "@/lib/corrections/policy";

export const DirectCatalogOverlayInputSchema = z.object({
  patch: CorrectionOverlayInputSchema,
  reason: z.string().trim().min(3).max(1000),
  sourceReleaseId: z.string().min(1).nullable(),
}).strict();

export type DirectCatalogOverlayInput = z.infer<typeof DirectCatalogOverlayInputSchema>;

