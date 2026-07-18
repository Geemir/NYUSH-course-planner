import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const UI_FILES = [
  "src/components/ui/dialog.tsx",
  "src/components/layout/PlannerHeader.tsx",
  "src/components/layout/PlannerWorkspace.tsx",
  "src/components/layout/WorkspaceTools.tsx",
  "src/components/inspiration/InspirationStrip.tsx",
  "src/components/planner/PlannerBoard.tsx",
  "src/components/planner/SemesterColumn.tsx",
  "src/components/planner/CourseChip.tsx",
  "src/components/catalog/CourseCatalog.tsx",
  "src/components/progress/ProgressRings.tsx",
  "src/components/progress/RequirementChecklist.tsx",
  "src/components/progress/SpecialRulesPanel.tsx",
  "src/components/progress/WarningCenter.tsx",
  "src/components/progress/FeasibilityDialog.tsx",
] as const;

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Academic Workspace design rules", () => {
  it.each(UI_FILES)("keeps %s free of agreed visual anti-patterns", (path) => {
    const text = source(path);
    const arbitraryRadii = [...text.matchAll(/rounded-\[(\d+)px\]/g)].map(
      (match) => Number(match[1]),
    );

    expect(text, `${path}: gradient text`).not.toMatch(
      /(?:bg-clip-text|text-transparent)/,
    );
    expect(
      arbitraryRadii.every((radius) => radius <= 32),
      `${path}: radius above 32px`,
    ).toBe(true);
    expect(text, `${path}: arbitrary z-index`).not.toMatch(
      /z-\[(?:9{3,}|\d{4,})\]/,
    );
    expect(text, `${path}: side accent border`).not.toMatch(
      /border-[lr]-(?:2|4|8)(?:\s|\")/,
    );
    expect(text, `${path}: uppercase tracked scaffold`).not.toMatch(
      /(?:tracking-[^\s"']+[^\n]*uppercase|uppercase[^\n]*tracking-[^\s"']+)/,
    );
    expect(text, `${path}: wide shadow paired with border`).not.toMatch(
      /border[^\n"']*shadow-(?:lg|xl|2xl)/,
    );
  });

  it("defines the Academic Workspace token contract and reduced motion", () => {
    const css = source("src/app/globals.css");
    for (const token of [
      "--z-dropdown",
      "--z-sticky",
      "--z-backdrop",
      "--z-modal",
      "--z-toast",
      "--z-tooltip",
      "--motion-fast: 160ms",
      "--motion-standard: 260ms",
    ]) {
      expect(css).toContain(token);
    }
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(css).not.toMatch(/SF Pro(?: Text| Display)?/);
    expect(css).toMatch(/body\s*\{[\s\S]*?font-size:\s*1rem/);
  });

  it("describes a planner for every NYU Shanghai major", () => {
    const layout = source("src/app/layout.tsx");
    expect(layout).toContain("all NYU Shanghai majors");
  });

  it("keeps compact planner controls at a 44px touch target", () => {
    expect(source("src/components/layout/PlannerHeader.tsx")).toContain(
      'className="h-11 min-w-11 px-3"',
    );
    expect(source("src/components/planner/StudyAwaySelect.tsx")).toContain(
      "data-[size=sm]:h-11",
    );
  });
});
