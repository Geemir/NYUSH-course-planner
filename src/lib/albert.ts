import "server-only";
import { SITES } from "@/lib/data";
import {
  AlbertDetails,
  normalizeAlbertCourse,
  sanitizePrereqMap,
} from "@/lib/albertNormalize";
import { Course } from "@/lib/types";

const FOSE_BASE = "https://bulletins.nyu.edu/class-search/api/";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const USER_AGENT = "NYUSH-Course-Planner/1.0 (educational project; on-demand)";
const DETAIL_DELAY_MS = 150; // be polite between detail calls
const MAX_DETAIL_CALLS = 80; // bound work per import
const MAX_COURSES = 60;
const MAX_ENRICH = 40; // courses per AI prereq-enrichment call
const CACHE_TTL_MS = 5 * 60 * 1000;

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best-effort: extract structured prerequisites from courses' restriction /
 * description text via one batched DeepSeek call. Maps prose and course names
 * → official codes using the supplied catalog. Returns `code -> AND-of-ORs`;
 * on any failure returns an empty map (enrichment never breaks an import).
 */
async function enrichPrereqs(
  items: { code: string; text: string }[],
  catalog: Course[],
): Promise<Map<string, string[][]>> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || items.length === 0) return new Map();

  const catalogList = catalog
    .map((c) => `${c.id} — ${c.title}`)
    .join("\n")
    .slice(0, 9000);
  const courseBlock = items
    .slice(0, MAX_ENRICH)
    .map((i) => `${i.code}: ${i.text.slice(0, 600)}`)
    .join("\n");

  const system = `You extract course prerequisites for NYU Shanghai courses from their catalog restriction/description text. Reply with JSON only:
{"prereqs":{"<CODE>":[["<CODE>", ...], ...]}}
Each course maps to an AND-of-ORs of official course codes: the outer array lists requirements (all needed), each inner array lists interchangeable options (any one satisfies). Map course NAMES to official CODES using the catalog below. Omit a course (or use []) when it has no genuine COURSE prerequisite. Only use codes from the catalog. Ignore non-course requirements like "instructor consent", class standing, or GPA.

Catalog (code — title):
${catalogList}`;

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: courseBlock },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return new Map();
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return sanitizePrereqMap(JSON.parse(data.choices?.[0]?.message?.content ?? "{}"));
  } catch {
    return new Map();
  }
}

export class AlbertError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

const siteIdByName = new Map(SITES.map((s) => [s.name.toLowerCase(), s.id]));

interface SearchRow {
  code?: string;
  crn?: string;
  srcdb?: string;
  title?: string;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fose<T>(
  route: "search" | "details",
  query: string,
  body: unknown,
): Promise<T> {
  const url = `${FOSE_BASE}?page=fose&route=${route}${query ? `&${query}` : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-requested-with": "XMLHttpRequest",
      "user-agent": USER_AGENT,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new AlbertError(`NYU class-search ${route} failed (${res.status})`);
  }
  return (await res.json()) as T;
}

async function searchSubject(
  subject: string,
  srcdb: string,
): Promise<SearchRow[]> {
  const query = `coll=UI,GI&subject=${encodeURIComponent(subject)}`;
  const data = await fose<{ results?: SearchRow[] }>("search", query, {
    other: { srcdb },
    criteria: [{ field: "subject", value: subject }],
  });
  return data.results ?? [];
}

function fetchDetails(
  code: string,
  crn: string,
  srcdb: string,
): Promise<AlbertDetails> {
  return fose<AlbertDetails>("details", "", {
    group: `code:${code}`,
    key: `crn:${crn}`,
    srcdb,
  });
}

export interface ImportResult {
  courses: Course[];
  sectionsSeen: number;
  distinctCourses: number;
  detailCalls: number;
  /** How many courses had prereqs filled by the AI enrichment pass. */
  enrichedCourses: number;
}

const cache = new Map<string, { result: ImportResult; ts: number }>();

/**
 * Fetches a subject's courses from NYU's public class-search (FOSE) API and
 * normalizes them to our Course shape. Sequential + rate-limited + capped to
 * stay polite. Results are cached briefly so a preview and its follow-up
 * commit don't re-hit the API.
 */
export async function importSubject(
  subject: string,
  opts: { srcdb?: string; enrich?: boolean; catalog?: Course[] } = {},
): Promise<ImportResult> {
  const code = subject.trim().toUpperCase();
  if (!/^[A-Z]{2,5}-[A-Z]{2,3}$/.test(code)) {
    throw new AlbertError(
      `"${subject}" is not a subject code like "CSCI-SHU".`,
      400,
    );
  }
  const srcdb = opts.srcdb ?? "9999"; // 9999 = current term
  const cacheKey = `${code}|${srcdb}|${opts.enrich ? "ai" : "raw"}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.result;

  const rows = await searchSubject(code, srcdb);

  // Group sections by course code; keep one CRN per (code, srcdb) so we can
  // union campus_location across a course's sessions.
  const byCode = new Map<string, Map<string, string>>();
  for (const row of rows) {
    if (!row.code || !row.crn || !row.srcdb) continue;
    if (!byCode.has(row.code)) byCode.set(row.code, new Map());
    const perSrcdb = byCode.get(row.code)!;
    if (!perSrcdb.has(row.srcdb)) perSrcdb.set(row.srcdb, row.crn);
  }

  const courses: Course[] = [];
  const enrichItems: { code: string; text: string }[] = [];
  let detailCalls = 0;
  for (const [courseCode, perSrcdb] of [...byCode].slice(0, MAX_COURSES)) {
    let primary: AlbertDetails | undefined;
    const campuses = new Set<string>();
    for (const [sdb, crn] of perSrcdb) {
      if (detailCalls >= MAX_DETAIL_CALLS) break;
      try {
        const details = await fetchDetails(courseCode, crn, sdb);
        detailCalls++;
        if (!primary) primary = details;
        if (details.campus_location) campuses.add(details.campus_location);
      } catch {
        /* skip a bad section */
      }
      await delay(DETAIL_DELAY_MS);
    }
    if (primary) {
      const course = normalizeAlbertCourse(
        { details: primary, campuses: [...campuses] },
        siteIdByName,
      );
      if (course) {
        courses.push(course);
        const text = stripTags(
          `${primary.registration_restrictions ?? ""} ${primary.description ?? ""}`,
        );
        if (text.length > 12) enrichItems.push({ code: course.id, text });
      }
    }
  }

  // Optional: let DeepSeek read the restriction/description prose into
  // structured prereqs (one batched call), overriding the regex guess only
  // where it found something.
  let enrichedCourses = 0;
  if (opts.enrich && enrichItems.length > 0) {
    const map = await enrichPrereqs(enrichItems, opts.catalog ?? courses);
    for (const course of courses) {
      const prereqs = map.get(course.id);
      if (prereqs && prereqs.length > 0) {
        course.prereqs = prereqs;
        enrichedCourses++;
      }
    }
  }

  const result: ImportResult = {
    courses,
    sectionsSeen: rows.length,
    distinctCourses: byCode.size,
    detailCalls,
    enrichedCourses,
  };
  cache.set(cacheKey, { result, ts: Date.now() });
  return result;
}
