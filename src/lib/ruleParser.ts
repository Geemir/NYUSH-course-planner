import "server-only";
import { ParsedRule, RuleParseError, sanitizeRule } from "@/lib/ruleSanitize";
import { Course, GRADES } from "@/lib/types";

export { RuleParseError } from "@/lib/ruleSanitize";
export type { ParsedRule } from "@/lib/ruleSanitize";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

function buildSystemPrompt(courses: Course[]): string {
  const list = courses.map((c) => `  ${c.id} — ${c.title}`).join("\n");
  return `You convert an admin's plain-English description of a NYU Shanghai course-planning "special rule" into ONE JSON object. Reply with JSON only, no prose.

Two supported rule kinds:

1) "concurrentPrereq" — a course may be taken in the SAME term as one of its prerequisites (instead of strictly after), optionally only if the student earned a grade in some course:
{ "kind": "concurrentPrereq", "course": "<CODE>", "prereq": "<CODE>", "condition": { "course": "<CODE>", "minGrade": "A" } | null, "note": "<student-facing sentence>", "explanation": "<one sentence describing the rule>" }

2) "equivalence" — one course counts wherever another is required (prereqs, requirements):
{ "kind": "equivalence", "course": "<CODE>", "target": "<CODE>", "note": "<student-facing sentence>", "explanation": "<one sentence>" }

If the description matches neither, return { "kind": "unknown", "explanation": "<why>" }.

Rules:
- Map every course NAME to its official CODE using this catalog (left = code):
${list}
- minGrade must be one of: ${GRADES.join(", ")}.
- "course" is the course being taken; "prereq" is the prerequisite being relaxed; "condition.course" is the course whose grade unlocks it.
- Example: "An A in Intro to Computer Programming lets you take Data Structures and Intro to CS together" =>
  { "kind":"concurrentPrereq", "course":"CSCI-SHU 210", "prereq":"CSCI-SHU 101", "condition":{"course":"CSCI-SHU 11","minGrade":"A"}, ... }
- Use exact codes from the catalog. If you can't find a code, use your best guess of the official code format (DEPT-SHU NNN).`;
}

interface DeepSeekResponse {
  choices?: { message?: { content?: string } }[];
}

/** Parses an admin's plain-English rule description via DeepSeek. */
export async function parseRuleText(
  text: string,
  courses: Course[],
): Promise<ParsedRule> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new RuleParseError(
      "DEEPSEEK_API_KEY is not set — add it to .env.local and restart the dev server.",
      500,
    );
  }
  if (typeof text !== "string" || text.trim().length < 8) {
    throw new RuleParseError("Describe the rule in a sentence first.", 400);
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
        { role: "system", content: buildSystemPrompt(courses) },
        { role: "user", content: text },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new RuleParseError(
      `DeepSeek API error (${res.status}): ${detail.slice(0, 300)}`,
      502,
    );
  }

  const data = (await res.json()) as DeepSeekResponse;
  const content = data.choices?.[0]?.message?.content ?? "";
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new RuleParseError("The AI returned invalid JSON — try again.", 502);
  }
  return sanitizeRule(raw, courses);
}
