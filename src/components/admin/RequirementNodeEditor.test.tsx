// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RequirementNodeEditor } from "@/components/admin/RequirementNodeEditor";
import { render, screen } from "@/test/render";

describe("RequirementNodeEditor", () => {
  it("converts all requirements to choose X while preserving children", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RequirementNodeEditor value={{ kind: "all", children: [{ kind: "course", courseId: "A" }, { kind: "course", courseId: "B" }] }} onChange={onChange} />);
    await user.click(screen.getAllByRole("combobox", { name: "Requirement type" })[0]);
    await user.click(await screen.findByRole("option", { name: "Choose a number" }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "choose", count: 1, children: [{ kind: "course", courseId: "A" }, { kind: "course", courseId: "B" }] });
  });

  it("converts a node to manual confirmation", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RequirementNodeEditor value={{ kind: "course", courseId: "A" }} onChange={onChange} />);
    await user.click(screen.getByRole("combobox", { name: "Requirement type" }));
    await user.click(await screen.findByRole("option", { name: "Manual confirmation" }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "manualConfirmation", label: "Advisor confirmation", sourceText: "Verify against the Bulletin." });
  });
});
