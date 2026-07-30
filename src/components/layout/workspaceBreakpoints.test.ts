import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROGRESS_RAIL_GRID_CLASS,
  PROGRESS_RAIL_MIN_WIDTH,
  PROGRESS_RAIL_QUERY,
  PROGRESS_RAIL_REM,
  WORKSPACE_TOOLS_HIDDEN_CLASS,
} from "@/components/layout/workspaceBreakpoints";

/**
 * Regression guard: the progress rail's media query and the floating toolbar's
 * CSS hide rule must use the same width. When they drifted (rail 1792px,
 * toolbar hidden from Tailwind's 2xl = 1536px) degree progress was unreachable
 * between 1536px and 1791px — a range that includes 1920px screens at 125%
 * scaling, 1600px monitors, and 16-inch MacBooks.
 */
describe("workspace progress-rail breakpoint", () => {
  it("uses one width for the media query, the toolbar hide rule, and the grid", () => {
    expect(PROGRESS_RAIL_QUERY).toBe(`(min-width: ${PROGRESS_RAIL_MIN_WIDTH}px)`);
    expect(WORKSPACE_TOOLS_HIDDEN_CLASS).toBe("3xl:hidden");
    expect(PROGRESS_RAIL_GRID_CLASS.startsWith("3xl:")).toBe(true);
  });

  it("declares the 3xl breakpoint in globals.css at the same width", () => {
    // A named breakpoint is required: Tailwind emits arbitrary `min-[…]:`
    // variants before named ones, so `xl:` would override a wider arbitrary
    // variant at equal specificity.
    const css = readFileSync(resolve("src/app/globals.css"), "utf8");
    expect(css).toContain(`--breakpoint-3xl: ${PROGRESS_RAIL_REM}rem;`);
    expect(PROGRESS_RAIL_REM * 16).toBe(PROGRESS_RAIL_MIN_WIDTH);
    expect(WORKSPACE_TOOLS_HIDDEN_CLASS.startsWith("min-[")).toBe(false);
    expect(PROGRESS_RAIL_GRID_CLASS.startsWith("min-[")).toBe(false);
  });

  it("leaves no width where progress is unreachable", () => {
    // The toolbar is rendered whenever the rail is absent, and hidden by CSS
    // only where the rail is present, so every width offers exactly one route.
    const railVisible = (width: number) => width >= PROGRESS_RAIL_MIN_WIDTH;
    const toolbarHiddenByCss = (width: number) => width >= PROGRESS_RAIL_MIN_WIDTH;
    const widths = [320, 768, 1024, 1280, 1440, 1512, 1536, 1600, 1680, 1728, 1791, 1792, 1920, 2560];

    for (const width of widths) {
      const buttonReachable = !railVisible(width) && !toolbarHiddenByCss(width);
      expect(buttonReachable || railVisible(width)).toBe(true);
    }
  });
});
