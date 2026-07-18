import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_MAX_WIDTH_PX, CONTROL_HEIGHT, GLASS_BLUR_PX, MOTION_DURATION_MS } from "@/lib/designTokens";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("NYU Academic Glass tokens", () => {
  it("exports bounded control, motion, glass, and content dimensions", () => {
    expect(CONTROL_HEIGHT).toEqual({ compact: 36, default: 44, prominent: 52 });
    expect(MOTION_DURATION_MS).toEqual({ instant: 0, control: 160, surface: 260 });
    expect(GLASS_BLUR_PX).toEqual({ subtle: 12, strong: 20 });
    expect(CONTENT_MAX_WIDTH_PX).toBeGreaterThanOrEqual(1100);
  });

  it("uses the legal platform stack and NYU semantic palette", () => {
    expect(css.match(/--font-sans:/g)).toHaveLength(1);
    expect(css).toContain('-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif');
    expect(css).not.toMatch(/SF Pro(?: Text| Display)?/);
    for (const token of ["--nyu-violet", "--nyu-plum", "--nyu-lavender", "--surface-canvas", "--surface-content", "--surface-raised", "--surface-glass", "--text-primary", "--text-secondary", "--border-subtle", "--focus-ring"]) expect(css).toContain(token);
    expect(css).toMatch(/--nyu-violet:\s*#57068c/);
    expect(css).toMatch(/--primary:\s*var\(--nyu-violet\)/);
    expect(css).toMatch(/--ring:\s*var\(--focus-ring\)/);
  });

  it("defines accessibility preference fallbacks", () => {
    for (const query of ["prefers-reduced-motion: reduce", "prefers-reduced-transparency: reduce", "prefers-contrast: more", "forced-colors: active", "pointer: coarse"]) expect(css).toContain(query);
  });
});
