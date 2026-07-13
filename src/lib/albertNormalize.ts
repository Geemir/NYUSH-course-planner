import { Course, CourseSchema } from "@/lib/types";

/** Raw fields we consume from a FOSE `route=details` response. */
export interface AlbertDetails {
  code: string;
  title: string;
  hours_html?: string;
  campus_location?: string;
  description?: string;
  registration_restrictions?: string;
  start_date?: string;
  dates_html?: string;
}

/** Aggregated input for one course (details merged across its sections). */
export interface AlbertCourseInput {
  details: AlbertDetails;
  /** All distinct `campus_location` strings seen across the course's sections. */
  campuses: string[];
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** First integer in "4 Hour Lecture" → 4; falls back to 4. */
export function parseCredits(hoursHtml: string | undefined): number {
  const m = (hoursHtml ?? "").match(/\d+(?:\.\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 4;
}

/** Course codes referenced in restriction text, e.g. "CSCI-SHU 101". */
export function extractCourseCodes(text: string): string[] {
  const plain = stripHtml(text);
  const codes = plain.match(/[A-Z]{2,5}-[A-Z]{2,3}\s+\d{1,4}/g) ?? [];
  return [...new Set(codes.map((c) => c.replace(/\s+/g, " ").trim()))];
}

const CODE_RE = /^[A-Z]{2,5}-[A-Z]{2,3}\s+\d{1,4}$/;

/**
 * Sanitizes the AI prereq-enrichment response into `code -> AND-of-ORs`.
 * Accepts either `{prereqs:{CODE:[[...]]}}` or a bare `{CODE:[[...]]}`. Keeps
 * only code-shaped strings, drops empty groups, and never lets the model
 * invent free-text prerequisites. Pure — unit-testable.
 */
export function sanitizePrereqMap(
  raw: unknown,
): Map<string, string[][]> {
  const out = new Map<string, string[][]>();
  if (!raw || typeof raw !== "object") return out;
  const container =
    "prereqs" in raw && typeof (raw as { prereqs: unknown }).prereqs === "object"
      ? (raw as { prereqs: Record<string, unknown> }).prereqs
      : (raw as Record<string, unknown>);

  for (const [code, value] of Object.entries(container ?? {})) {
    const key = code.replace(/\s+/g, " ").trim();
    if (!CODE_RE.test(key)) continue;
    if (!Array.isArray(value)) continue;
    const groups: string[][] = [];
    for (const group of value) {
      const arr = Array.isArray(group) ? group : [group];
      const codes = arr
        .map((c) => String(c).replace(/\s+/g, " ").trim())
        .filter((c) => CODE_RE.test(c));
      if (codes.length > 0) groups.push([...new Set(codes)]);
    }
    if (groups.length > 0) out.set(key, groups);
  }
  return out;
}

/** fall if the term starts Jul–Dec, else spring. Derived from the start date. */
function offeredFromDates(
  startDate: string | undefined,
  datesHtml: string | undefined,
): ("fall" | "spring")[] {
  const iso = startDate || (datesHtml ?? "").match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const month = iso ? Number(iso.slice(5, 7)) : NaN;
  if (!Number.isFinite(month)) return ["fall", "spring"];
  return [month >= 7 ? "fall" : "spring"];
}

const SUBJECT_DEPARTMENTS: Record<string, string> = {
  CSCI: "Computer Science",
  DATS: "Data Science",
  MATH: "Mathematics",
  INTM: "Interactive Media Arts",
  CENG: "Computer Engineering",
  BUSF: "Business & Finance",
  ECON: "Economics",
  WRIT: "Writing",
  CHIN: "Chinese Language",
};

function departmentFor(code: string): string {
  const subject = code.split("-")[0];
  return SUBJECT_DEPARTMENTS[subject] ?? subject ?? "Unknown";
}

/**
 * Converts an aggregated Albert course into our `Course`. Pure — no network,
 * no server-only deps — so it is unit-testable. Fills the catalog *facts*
 * (code, title, credits, campus→sites, offered term, description, referenced
 * prereqs); `fulfills` stays empty since class-search carries no program
 * requirements (those remain curated). Returns null if it can't be validated.
 */
export function normalizeAlbertCourse(
  input: AlbertCourseInput,
  siteIdByName: Map<string, string>,
): Course | null {
  const { details, campuses } = input;
  const id = (details.code ?? "").replace(/\s+/g, " ").trim();
  const title = (details.title ?? "").trim();
  if (!id || !title) return null;

  const sites = [
    ...new Set(
      campuses
        .map((c) => siteIdByName.get(c.trim().toLowerCase()))
        .filter((s): s is string => Boolean(s)),
    ),
  ];

  const prereqCodes = extractCourseCodes(details.registration_restrictions ?? "")
    .filter((c) => c !== id);

  const description = stripHtml(details.description ?? "") || undefined;
  const isCapstone = /\b(capstone|senior project|thesis)\b/i.test(
    `${id} ${title}`,
  );

  const candidate = {
    id,
    title,
    credits: parseCredits(details.hours_html),
    department: departmentFor(id),
    description,
    // Each referenced course as its own AND-group (best-effort from free text).
    prereqs: prereqCodes.map((c) => [c]),
    offered: offeredFromDates(details.start_date, details.dates_html),
    sites: sites.length > 0 ? sites : ["shanghai"],
    fulfills: [],
    equivalentTo: [],
    tags: isCapstone ? ["capstone"] : [],
  };

  const parsed = CourseSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
