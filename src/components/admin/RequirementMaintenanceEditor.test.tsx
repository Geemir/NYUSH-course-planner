// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RequirementMaintenanceEditor } from "@/components/admin/RequirementMaintenanceEditor";
import { render, screen } from "@/test/render";

const program = {
  id: "core", name: "Core", shortName: "Core", type: "core" as const,
  categories: [{ id: "ipc", name: "IPC", requirement: { kind: "choose" as const, count: 2, children: [{ kind: "attribute" as const, attribute: "IPC" }] }, sourceUrl: "https://bulletins.nyu.edu/core", sourceTableId: "t", sourceRowIndexes: [0] }],
  requirementRows: [], sourceRows: [], sourceReferenceIds: [], provenance: { sourceUrl: "https://bulletins.nyu.edu/core", snapshotId: "s", sourceHash: "h" }, auditAuthority: "nyush-bulletin" as const, eligibleProfileRoles: ["core" as const], reviewedOverlayIds: [], reviewedNotes: [],
};

describe("RequirementMaintenanceEditor", () => {
  it("adds and deletes categories through audited overlays", async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn().mockResolvedValue(undefined);
    render(<RequirementMaintenanceEditor programs={[program]} onPublish={onPublish} />);
    await user.click(screen.getByRole("button", { name: "Add category" }));
    await user.clear(screen.getByLabelText("Category id"));
    await user.type(screen.getByLabelText("Category id"), "capstone");
    await user.clear(screen.getByLabelText("Category name"));
    await user.type(screen.getByLabelText("Category name"), "Capstone");
    await user.type(screen.getByLabelText("Requirement change reason"), "Add the published capstone requirement.");
    await user.click(screen.getByRole("button", { name: "Publish requirement" }));
    expect(onPublish).toHaveBeenLastCalledWith(expect.objectContaining({ patch: expect.objectContaining({ kind: "requirement-upsert", programId: "core", category: expect.objectContaining({ id: "capstone", name: "Capstone" }) }) }));

    await user.type(screen.getByLabelText("Requirement change reason"), "Retire duplicated IPC category.");
    await user.click(screen.getByRole("button", { name: "Delete IPC" }));
    expect(onPublish).toHaveBeenLastCalledWith(expect.objectContaining({ patch: { kind: "requirement-delete", programId: "core", categoryId: "ipc" } }));
  });
});
