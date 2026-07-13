import "server-only";
import { PROGRAMS, SITES } from "@/lib/data";
import { Course, CourseSchema, TERMS } from "@/lib/types";

export { splitListings } from "@/lib/listings";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

export class CourseParseError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

function buildSystemPrompt(): string {
  const categories = PROGRAMS.flatMap((p) =>
    p.categories.map(
      (c) =>
        `  - programId "${p.id}", categoryId "${c.id}" — ${p.name}: ${c.name}`,
    ),
  ).join("\n");
  const sites = SITES.map((s) => `"${s.id}" (${s.name})`).join(", ");

  return `You convert a pasted NYU Shanghai Albert course listing into a JSON object for a course-planner app. Reply with ONE JSON object only, no prose.

Output shape:
{
  "id": "DEPT-SHU 123",            // official course code from the listing header
  "title": "Course Title",
  "credits": 4,                     // number, from "N units"
  "department": "Human-readable department, inferred from the subject code",
  "description": "1-3 sentence summary of the course description",
  "prereqs": [["CSCI-SHU 101", "CSCI-SHU 11"]],  // AND of ORs: each inner array is one requirement satisfiable by any listed course code. "Pre-requisites: None" => []
  "offered": ["fall"],             // from the Term line: Fall* => "fall", Spring* => "spring"; if unclear use ["fall","spring"]
  "sites": ["shanghai"],           // from Course Location; allowed ids: ${sites}
  "fulfills": [{"programId": "cs", "categoryId": "cs-elect"}],
  "tags": []                        // add "capstone" only for senior capstone/thesis courses; add "cross-listed" if fulfills spans the cs AND ima majors
}

Mapping the "Fulfillment:" text to "fulfills" — ONLY these targets exist:
${categories}

Rules for fulfills:
- Map only what the text clearly supports (e.g. "CS ... Foundational course" => cs/cs-found; "CS elective" => cs/cs-elect; "IMA/IMB ... elective" => ima/ima-elect; core curriculum mentions => the matching core category).
- Mentions of majors that are not in the list above (BUSF, BUSM, ECON, ...) have no target — omit them.
- "IMB" (Interactive Media and Business) and "IMA/IMB" business tracks are NOT the IMA major — only map explicit "IMA" mentions to ima/* targets.
- When unsure, omit the entry. An empty "fulfills" is valid (course still counts as free elective credits).
- Allowed terms: ${TERMS.join(", ")}. Non-Shanghai NYU sites only if the listing says so.
- Prerequisite course codes must look like official codes ("XXXX-SHU N"); drop vague text like "instructor consent".`;
}

interface DeepSeekResponse {
  choices?: { message?: { content?: string } }[];
}

/**
 * Sanitizes a raw model object into a valid Course. The model may only fill in
 * values the app understands; unknown categories/sites are dropped, never
 * trusted. Throws CourseParseError on unrecoverable output.
 */
function sanitize(raw: Record<string, unknown>): Course {
  const knownCategories = new Set(
    PROGRAMS.flatMap((p) => p.categories.map((c) => `${p.id}/${c.id}`)),
  );
  const knownSites = new Set(SITES.map((s) => s.id));
  const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  const candidate = {
    id: String(raw.id ?? "").trim(),
    title: String(raw.title ?? "").trim(),
    credits: Number(raw.credits) > 0 ? Number(raw.credits) : 4,
    department: String(raw.department ?? "").trim() || "Unknown",
    description:
      typeof raw.description === "string" && raw.description.trim()
        ? raw.description.trim()
        : undefined,
    prereqs: asArray(raw.prereqs)
      .map((g) => asArray(g).map(String).filter(Boolean))
      .filter((g) => g.length > 0),
    offered: asArray(raw.offered).filter(
      (t): t is "fall" | "spring" => t === "fall" || t === "spring",
    ),
    sites: asArray(raw.sites)
      .map(String)
      .filter((s) => knownSites.has(s)),
    fulfills: asArray(raw.fulfills)
      .map((f) => f as { programId?: unknown; categoryId?: unknown })
      .map((f) => ({
        programId: String(f.programId ?? ""),
        categoryId: String(f.categoryId ?? ""),
      }))
      .filter((f) => knownCategories.has(`${f.programId}/${f.categoryId}`)),
    tags: asArray(raw.tags).map(String),
  };
  if (candidate.offered.length === 0) candidate.offered = ["fall", "spring"];
  if (candidate.sites.length === 0) candidate.sites = ["shanghai"];

  const result = CourseSchema.safeParse(candidate);
  if (!result.success) {
    throw new CourseParseError(
      `Could not extract a valid course: ${result.error.issues[0]?.message ?? "unknown issue"}`,
    );
  }
  return result.data;
}

/** Parses a single pasted Albert listing into a Course via DeepSeek. */
export async function parseCourseListing(text: string): Promise<Course> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new CourseParseError(
      "DEEPSEEK_API_KEY is not set — add it to .env.local and restart the dev server.",
      500,
    );
  }
  if (typeof text !== "string" || text.trim().length < 20) {
    throw new CourseParseError(
      "Paste the full course listing text from Albert first.",
      400,
    );
  }

  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: text },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new CourseParseError(
      `DeepSeek API error (${res.status}): ${detail.slice(0, 300)}`,
      502,
    );
  }

  const data = (await res.json()) as DeepSeekResponse;
  const content = data.choices?.[0]?.message?.content ?? "";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new CourseParseError(
      "The AI returned invalid JSON — try parsing again.",
      502,
    );
  }
  return sanitize(parsed);
}

