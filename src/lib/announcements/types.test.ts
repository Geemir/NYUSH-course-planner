import { describe, expect, it } from "vitest";
import {
  AnnouncementActionSchema,
  AnnouncementInputSchema,
  PublicAnnouncementSchema,
} from "@/lib/announcements/types";

const valid = {
  title: "Registration reminder",
  body: "Review your plan before advising week.",
  tone: "info" as const,
  linkUrl: "https://www.nyu.edu/registration",
  linkLabel: "Registration details",
  expiresAt: "2099-08-30T12:00:00.000Z",
};

describe("announcement contracts", () => {
  it("accepts bounded plain-text content and normalizes blank optionals", () => {
    expect(AnnouncementInputSchema.parse({
      ...valid,
      linkUrl: "",
      linkLabel: " ",
      expiresAt: "",
    })).toEqual({ ...valid, linkUrl: null, linkLabel: null, expiresAt: null });
  });

  it.each([
    { ...valid, title: "" },
    { ...valid, title: "x".repeat(121) },
    { ...valid, body: "x".repeat(1001) },
    { ...valid, tone: "celebration" },
    { ...valid, linkUrl: "http://example.com" },
    { ...valid, linkLabel: "x".repeat(61) },
    { ...valid, expiresAt: "2020-01-01T00:00:00.000Z" },
    { ...valid, unexpected: true },
  ])("rejects invalid input %#", (input) => {
    expect(AnnouncementInputSchema.safeParse(input).success).toBe(false);
  });

  it("accepts only strict update, publish, and archive actions", () => {
    expect(AnnouncementActionSchema.parse({ action: "publish" })).toEqual({ action: "publish" });
    expect(AnnouncementActionSchema.parse({ action: "archive" })).toEqual({ action: "archive" });
    expect(AnnouncementActionSchema.parse({ action: "update", announcement: valid })).toMatchObject({ action: "update" });
    expect(AnnouncementActionSchema.safeParse({ action: "publish", title: "extra" }).success).toBe(false);
  });

  it("keeps actor and internal lifecycle fields out of the public DTO", () => {
    const publicValue = PublicAnnouncementSchema.parse({
      id: "announcement-1",
      title: valid.title,
      body: valid.body,
      tone: valid.tone,
      linkUrl: valid.linkUrl,
      linkLabel: valid.linkLabel,
      expiresAt: valid.expiresAt,
      publishedAt: "2026-07-29T00:00:00.000Z",
      createdBy: "admin-1",
      status: "published",
      createdAt: "2026-07-28T00:00:00.000Z",
    });

    expect(publicValue).not.toHaveProperty("createdBy");
    expect(publicValue).not.toHaveProperty("status");
    expect(publicValue).not.toHaveProperty("createdAt");
  });
});
