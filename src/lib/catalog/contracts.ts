import { z } from "zod";
import {
  CatalogCourseRecordSchema,
  CatalogReleaseRefSchema,
} from "@/lib/catalog/types";
import {
  CatalogProgramSchema,
  SiteSchema,
  SpecialRuleSchema,
} from "@/lib/types";

export const CatalogCourseQuerySchema = z
  .object({
    q: z.string().trim().max(120).default(""),
    campuses: z.array(z.enum(["shanghai", "new-york"])).max(2).default([]),
    sourceIds: z.array(z.string().min(1)).max(14).default([]),
    subjects: z.array(z.string().min(1)).max(30).default([]),
    levels: z.array(z.literal("undergraduate")).default(["undergraduate"]),
    catalogTerms: z.array(z.string().max(40)).max(12).default([]),
    minCredits: z.number().nonnegative().optional(),
    maxCredits: z.number().nonnegative().optional(),
    fulfillsProgramId: z.string().min(1).optional(),
    crossListed: z.boolean().optional(),
    cursor: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(100).default(40),
  })
  .strict()
  .refine(
    (query) =>
      query.minCredits === undefined ||
      query.maxCredits === undefined ||
      query.minCredits <= query.maxCredits,
    { message: "Minimum credits cannot exceed maximum credits", path: ["minCredits"] },
  );
export type CatalogCourseQuery = z.infer<typeof CatalogCourseQuerySchema>;

const ARRAY_PARAMETERS = {
  campus: "campuses",
  source: "sourceIds",
  subject: "subjects",
  level: "levels",
  catalogTerm: "catalogTerms",
} as const;
const ALLOWED_PARAMETERS = new Set([
  "q",
  ...Object.keys(ARRAY_PARAMETERS),
  "minCredits",
  "maxCredits",
  "fulfillsProgramId",
  "crossListed",
  "cursor",
  "limit",
]);

function optionalNumber(value: string | null): number | undefined {
  return value === null || value === "" ? undefined : Number(value);
}

export function parseCatalogCourseSearchParams(
  params: URLSearchParams,
): CatalogCourseQuery {
  for (const key of params.keys()) {
    if (!ALLOWED_PARAMETERS.has(key)) throw new Error(`Unknown catalog query key: ${key}`);
  }
  return CatalogCourseQuerySchema.parse({
    q: params.get("q") ?? undefined,
    ...Object.fromEntries(
      Object.entries(ARRAY_PARAMETERS).map(([parameter, field]) => [
        field,
        params.getAll(parameter),
      ]),
    ),
    minCredits: optionalNumber(params.get("minCredits")),
    maxCredits: optionalNumber(params.get("maxCredits")),
    fulfillsProgramId: params.get("fulfillsProgramId") ?? undefined,
    crossListed:
      params.has("crossListed")
        ? params.get("crossListed") === "true"
        : undefined,
    cursor: params.get("cursor") ?? undefined,
    limit: optionalNumber(params.get("limit")),
  });
}

export function catalogCourseQueryToSearchParams(
  input: CatalogCourseQuery,
): URLSearchParams {
  const query = CatalogCourseQuerySchema.parse(input);
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  const appendSet = (key: string, values: readonly string[]) =>
    [...new Set(values)].sort().forEach((value) => params.append(key, value));
  appendSet("campus", query.campuses);
  appendSet("source", query.sourceIds);
  appendSet("subject", query.subjects);
  appendSet("level", query.levels);
  appendSet("catalogTerm", query.catalogTerms);
  if (query.minCredits !== undefined) params.set("minCredits", String(query.minCredits));
  if (query.maxCredits !== undefined) params.set("maxCredits", String(query.maxCredits));
  if (query.fulfillsProgramId) params.set("fulfillsProgramId", query.fulfillsProgramId);
  if (query.crossListed !== undefined) params.set("crossListed", String(query.crossListed));
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit !== 40) params.set("limit", String(query.limit));
  return params;
}

const CursorPayloadSchema = z.object({
  releaseId: z.string().min(1),
  code: z.string().min(1),
  stableId: z.string().min(1),
}).strict();
export type CatalogCursorPayload = z.infer<typeof CursorPayloadSchema>;

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export function encodeCatalogCursor(payload: CatalogCursorPayload): string {
  return base64UrlEncode(JSON.stringify(CursorPayloadSchema.parse(payload)));
}

export function decodeCatalogCursor(cursor: string, releaseId: string): CatalogCursorPayload {
  let payload: CatalogCursorPayload;
  try {
    payload = CursorPayloadSchema.parse(JSON.parse(base64UrlDecode(cursor)));
  } catch {
    throw new Error("Invalid catalog cursor");
  }
  if (payload.releaseId !== releaseId) throw new Error("Catalog cursor release mismatch");
  return payload;
}

export const CatalogSourceSummarySchema = z.object({
  id: z.string(),
  schoolName: z.string(),
  campus: z.enum(["shanghai", "new-york"]),
  courseCount: z.number().int().nonnegative(),
  status: z.enum(["healthy", "stale", "failed-with-last-known-good"]),
}).strict();
export const CatalogSubjectSummarySchema = z.object({
  subject: z.string(),
  courseCount: z.number().int().nonnegative(),
}).strict();

export const CatalogBootstrapResponseSchema = z.object({
  release: CatalogReleaseRefSchema,
  programs: z.array(CatalogProgramSchema),
  rules: z.array(SpecialRuleSchema),
  sources: z.array(CatalogSourceSummarySchema),
  sites: z.array(SiteSchema),
  filters: z.object({
    subjects: z.array(CatalogSubjectSummarySchema),
    catalogTerms: z.array(z.string()),
    creditBounds: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
  }).strict(),
}).strict();
export type CatalogBootstrapResponse = z.infer<typeof CatalogBootstrapResponseSchema>;

export const CatalogCoursePageSchema = z.object({
  releaseId: z.string(),
  items: z.array(CatalogCourseRecordSchema).max(100),
  nextCursor: z.string().nullable(),
  totalApproximate: z.number().int().nonnegative().nullable(),
}).strict();
export type CatalogCoursePage = z.infer<typeof CatalogCoursePageSchema>;

export const CatalogCourseBatchRequestSchema = z.object({
  stableIds: z.array(z.string().min(1)).max(100).transform((ids) => [...new Set(ids)]),
}).strict();
export const CatalogCourseBatchResponseSchema = z.object({
  releaseId: z.string(),
  items: z.array(CatalogCourseRecordSchema).max(100),
  missingStableIds: z.array(z.string()),
}).strict();
export type CatalogCourseBatchResponse = z.infer<typeof CatalogCourseBatchResponseSchema>;
export const CatalogCourseDetailResponseSchema = CatalogCourseRecordSchema;
