// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AcademicGlassPrototype } from "@/components/design/AcademicGlassPrototype";

describe("AcademicGlassPrototype", () => {
  it("keeps the preview behind a production not-found guard", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/design-preview/page.tsx"), "utf8");
    expect(source).toContain('process.env.NODE_ENV === "production"');
    expect(source).toContain("notFound()");
  });
  it("demonstrates representative planner, catalog, filter, status, and detail states", async () => {
    const user = userEvent.setup(); render(<AcademicGlassPrototype />);
    expect(screen.getByRole("heading", { name: "Four-year plan" })).toBeDefined();
    expect(screen.getByRole("status").textContent).toContain("Saved");
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    expect(screen.getByRole("combobox", { name: "School" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: /CSCI-SHU 210/ }));
    expect(screen.getByRole("dialog", { name: "Data Structures" })).toBeDefined();
  });

  it("provides preference simulation without removing keyboard controls", async () => {
    const user = userEvent.setup(); render(<AcademicGlassPrototype />);
    for (const name of ["Reduced motion", "Reduced transparency", "Reduced contrast"]) await user.click(screen.getByRole("checkbox", { name }));
    expect(screen.getByRole("checkbox", { name: "Reduced motion" }).getAttribute("aria-checked") ?? (screen.getByRole("checkbox", { name: "Reduced motion" }) as HTMLInputElement).checked).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save plan" })).toBeDefined();
  });
});
