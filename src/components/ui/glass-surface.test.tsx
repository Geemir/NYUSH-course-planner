// @vitest-environment jsdom
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GlassSurface } from "@/components/ui/glass-surface";

describe("GlassSurface", () => {
  it("forwards refs and composes semantic material classes", () => {
    const ref = createRef<HTMLDivElement>();
    render(<GlassSurface ref={ref} strength="strong" elevation="overlay" className="custom">Tools</GlassSurface>);
    expect(ref.current?.className).toContain("functional-glass-strong");
    expect(ref.current?.className).toContain("custom");
  });

  it("supports asChild without creating a nested interactive wrapper", () => {
    render(<GlassSurface asChild><nav aria-label="Floating tools">Tools</nav></GlassSurface>);
    expect(screen.getByRole("navigation", { name: "Floating tools" }).className).toContain("functional-glass");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("forces an opaque fallback for content surfaces", () => {
    render(<GlassSurface data-content-surface>Long reading content</GlassSurface>);
    const surface = screen.getByText("Long reading content");
    expect(surface.className).toContain("bg-card");
    expect(surface.className).not.toContain("functional-glass");
  });
});
