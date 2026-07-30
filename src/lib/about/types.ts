import { z } from "zod";

/**
 * Structured "About this site" content, edited from /admin and rendered on the
 * public /about page. Everything is a bounded, validated field rather than raw
 * HTML/Markdown, so admin-authored text can never inject markup.
 */

const nullableText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().min(1).max(max).nullable().optional().default(null),
  );

const HttpsUrlSchema = z
  .string()
  .trim()
  .url()
  .max(300)
  .refine((value) => new URL(value).protocol === "https:", "Links must use HTTPS.");

/** Inline QR image, stored with the row so admins never need an image host. */
export const QR_IMAGE_MAX_CHARS = 350_000; // ~260 KB of base64
const QrImageSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z
    .string()
    .max(QR_IMAGE_MAX_CHARS, "The QR image must be smaller than about 250 KB.")
    .regex(
      /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/,
      "The QR image must be a PNG, JPEG, or WebP upload.",
    )
    .nullable()
    .optional()
    .default(null),
);

export const AboutLinkSchema = z
  .object({ label: z.string().trim().min(1).max(60), url: HttpsUrlSchema })
  .strict();

export const AboutPersonSchema = z
  .object({ name: z.string().trim().min(1).max(80), note: nullableText(140) })
  .strict();

export const AboutContactKindSchema = z.enum(["email", "wechat", "other"]);

export const AboutContactSchema = z
  .object({
    kind: AboutContactKindSchema,
    label: z.string().trim().min(1).max(60),
    value: z.string().trim().min(1).max(160),
  })
  .strict();

export const AboutDonationSchema = z
  .object({
    note: nullableText(400),
    /** Revealed only after the reader taps the button. */
    qrImage: QrImageSchema,
    qrCaption: nullableText(140),
  })
  .strict();

export const AboutContentSchema = z
  .object({
    headline: z.string().trim().min(1).max(120),
    intro: z.string().trim().min(1).max(4000),
    /** Short factual chips, e.g. "Unofficial", "Free to use". */
    badges: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
    links: z.array(AboutLinkSchema).max(10).default([]),
    contributors: z.array(AboutPersonSchema).max(50).default([]),
    thanks: z.array(AboutPersonSchema).max(100).default([]),
    contacts: z.array(AboutContactSchema).max(10).default([]),
    donation: AboutDonationSchema.nullable().default(null),
  })
  .strict();

export type AboutLink = z.infer<typeof AboutLinkSchema>;
export type AboutPerson = z.infer<typeof AboutPersonSchema>;
export type AboutContact = z.infer<typeof AboutContactSchema>;
export type AboutDonation = z.infer<typeof AboutDonationSchema>;
export type AboutContent = z.infer<typeof AboutContentSchema>;

export interface AboutRecord {
  content: AboutContent;
  updatedAt: string | null;
  updatedBy: string | null;
}

/**
 * Shown until an administrator saves an edit, so the page is never blank on a
 * fresh deployment.
 */
export const DEFAULT_ABOUT_CONTENT: AboutContent = AboutContentSchema.parse({
  headline: "About the NYUSH Course Planner",
  intro:
    "This is an unofficial, free planning tool for NYU Shanghai students. It " +
    "helps you lay out four years of coursework, see how a plan lines up with " +
    "Bulletin requirements, and explore study-away options. It is not a degree " +
    "audit and carries no authority: always confirm requirements against the " +
    "current NYU Shanghai Bulletin and with your academic adviser. The site is " +
    "run at no cost to students, hosted on Vercel with a Neon Postgres database.",
  badges: ["Unofficial", "Free to use", "Open source", "Hosted on Vercel + Neon"],
  links: [
    {
      label: "Source code on GitHub",
      url: "https://github.com/Geemir/NYUSH-course-planner",
    },
  ],
  contributors: [
    { name: "Ryan Gu", note: "Creator and maintainer" },
    { name: "Claude Opus", note: "Development" },
    { name: "Claude Fable", note: "Development" },
    { name: "Codex GPT Sol 5.6", note: "Development" },
  ],
  thanks: [],
  contacts: [
    { kind: "email", label: "NYU email", value: "mg8974@nyu.edu" },
    { kind: "email", label: "Personal email", value: "ryangu70523@gmail.com" },
    { kind: "wechat", label: "WeChat", value: "Gu200700523" },
  ],
  donation: {
    note:
      "This planner is free and always will be. If it saved you some time and " +
      "you would like to chip in toward hosting costs, you can scan the code " +
      "below — entirely optional, and thank you.",
    qrImage: null,
    qrCaption: null,
  },
});
