import type { Metadata } from "next";
import { AboutContentView } from "@/components/about/AboutContentView";
import { db } from "@/db";
import { readAbout } from "@/lib/about/repository";
import { DEFAULT_ABOUT_CONTENT, type AboutRecord } from "@/lib/about/types";

export const metadata: Metadata = {
  title: "About — NYUSH Course Planner",
  description:
    "An unofficial, free four-year course planner for NYU Shanghai students: what it is, who built it, how to get in touch, and how to support it.",
};

/** Always read the current admin-edited content rather than a build snapshot. */
export const dynamic = "force-dynamic";

export default async function AboutPage() {
  let record: AboutRecord;
  try {
    record = await readAbout(db);
  } catch {
    record = { content: DEFAULT_ABOUT_CONTENT, updatedAt: null, updatedBy: null };
  }
  return <AboutContentView content={record.content} updatedAt={record.updatedAt} />;
}
