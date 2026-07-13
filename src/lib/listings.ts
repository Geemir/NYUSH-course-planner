/**
 * Splits a multi-course admin paste into individual listings.
 *
 * Admins separate courses with a line of 3+ dashes; otherwise we fall back to
 * starting a new course at each *title header* line — a course code followed
 * by its title (e.g. "CSCI-SHU 350 Deep Learning"). The repeated
 * "CSCI-SHU 350 | 4 units" line is deliberately NOT treated as a boundary.
 *
 * Pure string logic (no server deps) so it can be unit-tested directly.
 */
export function splitListings(text: string): string[] {
  const byRule = text
    .split(/\n\s*-{3,}\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (byRule.length > 1) return byRule;

  const titleHeader = /^[A-Z]{2,5}-SHU\s+\d[\dA-Za-z]*\s+[A-Za-z]/;
  const chunks: string[] = [];
  let current: string[] = [];
  for (const line of text.split("\n")) {
    if (titleHeader.test(line.trim()) && current.some((l) => l.trim())) {
      chunks.push(current.join("\n").trim());
      current = [];
    }
    current.push(line);
  }
  if (current.some((l) => l.trim())) chunks.push(current.join("\n").trim());
  return chunks.filter((c) => c.trim().length >= 20);
}
