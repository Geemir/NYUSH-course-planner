import { describe, expect, it } from "vitest";
import {
  AboutContentSchema,
  DEFAULT_ABOUT_CONTENT,
  QR_IMAGE_MAX_CHARS,
} from "@/lib/about/types";

const base = {
  headline: "About",
  intro: "An unofficial planner.",
};

describe("AboutContentSchema", () => {
  it("fills optional collections and keeps the defaults valid", () => {
    const parsed = AboutContentSchema.parse(base);
    expect(parsed).toMatchObject({
      badges: [],
      links: [],
      contributors: [],
      thanks: [],
      contacts: [],
      donation: null,
    });
    expect(AboutContentSchema.parse(DEFAULT_ABOUT_CONTENT)).toEqual(DEFAULT_ABOUT_CONTENT);
  });

  it("requires HTTPS links and rejects unknown fields", () => {
    expect(
      AboutContentSchema.safeParse({
        ...base,
        links: [{ label: "Repo", url: "http://github.com/x/y" }],
      }).success,
    ).toBe(false);
    expect(
      AboutContentSchema.safeParse({ ...base, script: "<script>" }).success,
    ).toBe(false);
  });

  it("accepts only bounded image uploads for the donation QR", () => {
    const ok = AboutContentSchema.safeParse({
      ...base,
      donation: { note: "Thanks", qrImage: "data:image/png;base64,AAAA", qrCaption: null },
    });
    expect(ok.success).toBe(true);

    // A remote URL is not an upload, so it cannot smuggle in a tracking pixel.
    expect(
      AboutContentSchema.safeParse({
        ...base,
        donation: { note: null, qrImage: "https://example.com/qr.png", qrCaption: null },
      }).success,
    ).toBe(false);

    // Oversized payloads are refused before they reach the database.
    expect(
      AboutContentSchema.safeParse({
        ...base,
        donation: {
          note: null,
          qrImage: `data:image/png;base64,${"A".repeat(QR_IMAGE_MAX_CHARS)}`,
          qrCaption: null,
        },
      }).success,
    ).toBe(false);
  });

  it("treats blank optional text as absent", () => {
    const parsed = AboutContentSchema.parse({
      ...base,
      contributors: [{ name: "Ryan Gu", note: "   " }],
      donation: { note: "", qrImage: "", qrCaption: "" },
    });
    expect(parsed.contributors[0].note).toBeNull();
    expect(parsed.donation).toEqual({ note: null, qrImage: null, qrCaption: null });
  });
});
