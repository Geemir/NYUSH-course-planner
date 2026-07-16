// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { WorkspaceTools } from "@/components/layout/WorkspaceTools";
import { render, screen } from "@/test/render";

describe("WorkspaceTools", () => {
  it("keeps mobile actions above the device safe area", () => {
    render(
      <WorkspaceTools>
        <button type="button">Courses</button>
      </WorkspaceTools>,
    );

    expect(
      screen.getByRole("toolbar", { name: "Workspace tools" }).parentElement
        ?.style.bottom,
    ).toBe("calc(1rem + env(safe-area-inset-bottom))");
  });
});
