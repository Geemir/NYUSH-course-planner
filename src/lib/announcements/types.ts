import { z } from "zod";

export const AnnouncementToneSchema = z.enum(["info", "warning", "critical"]);
export const AnnouncementStatusSchema = z.enum(["draft", "published", "archived"]);

const nullableText = (max: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().min(1).max(max).nullable().optional().default(null),
);

const HttpsUrlSchema = z.string().trim().url().refine(
  (value) => new URL(value).protocol === "https:",
  "Announcement links must use HTTPS.",
);

const NullableHttpsUrlSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  HttpsUrlSchema.nullable().optional().default(null),
);

const NullableFutureDateSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.iso.datetime().refine(
    (value) => Date.parse(value) > Date.now(),
    "Expiry must be in the future.",
  ).nullable().optional().default(null),
);

export const AnnouncementInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
  tone: AnnouncementToneSchema,
  linkUrl: NullableHttpsUrlSchema,
  linkLabel: nullableText(60),
  expiresAt: NullableFutureDateSchema,
}).strict().refine(
  (value) => value.linkUrl !== null || value.linkLabel === null,
  { message: "A link label requires a link URL.", path: ["linkLabel"] },
);

const NullableIsoDateSchema = z.iso.datetime().nullable();

export const AnnouncementSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  body: z.string(),
  tone: AnnouncementToneSchema,
  linkUrl: z.string().nullable(),
  linkLabel: z.string().nullable(),
  status: AnnouncementStatusSchema,
  publishedAt: NullableIsoDateSchema,
  expiresAt: NullableIsoDateSchema,
  createdBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();

export const PublicAnnouncementSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  body: z.string(),
  tone: AnnouncementToneSchema,
  linkUrl: z.string().nullable(),
  linkLabel: z.string().nullable(),
  publishedAt: z.iso.datetime(),
  expiresAt: NullableIsoDateSchema,
});

export const AnnouncementActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), announcement: AnnouncementInputSchema }).strict(),
  z.object({ action: z.literal("publish") }).strict(),
  z.object({ action: z.literal("archive") }).strict(),
]);

export type AnnouncementTone = z.infer<typeof AnnouncementToneSchema>;
export type AnnouncementStatus = z.infer<typeof AnnouncementStatusSchema>;
export type AnnouncementInput = z.infer<typeof AnnouncementInputSchema>;
export type Announcement = z.infer<typeof AnnouncementSchema>;
export type PublicAnnouncement = z.infer<typeof PublicAnnouncementSchema>;
export type AnnouncementAction = z.infer<typeof AnnouncementActionSchema>;

export function toPublicAnnouncement(value: Announcement): PublicAnnouncement {
  return PublicAnnouncementSchema.parse(value);
}
