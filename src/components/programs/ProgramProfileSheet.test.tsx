// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramProfileSheet } from "@/components/programs/ProgramProfileSheet";
import { render, screen } from "@/test/render";
import type { CatalogProgram, CatalogProgramAuditAuthority, CatalogProgramProfileRole } from "@/lib/types";

function program(
  id: string,
  type: CatalogProgram["type"],
  roles: CatalogProgramProfileRole[],
  authority: CatalogProgramAuditAuthority = "nyush-bulletin",
): CatalogProgram {
  return {
    id,
    name: id === "cs" ? "Computer Science" : id === "data" ? "Data Science" : id === "math-minor" ? "Mathematics Minor" : id,
    shortName: id.toUpperCase(),
    type,
    categories: [{ id: `${id}-requirements`, name: `${id} requirements`, requirement: { kind: "course", courseId: `${id} 1` }, sourceUrl: "https://bulletins.nyu.edu/", sourceTableId: "table", sourceRowIndexes: [0] }],
    requirementRows: [], sourceRows: [], sourceReferenceIds: [],
    provenance: { sourceUrl: "https://bulletins.nyu.edu/", snapshotId: "snapshot", sourceHash: "hash" },
    auditAuthority: authority,
    eligibleProfileRoles: roles,
  };
}

const programs = [
  program("core", "core", ["core"]),
  program("cs", "major", ["primaryMajor", "secondMajor"]),
  program("data", "major", ["primaryMajor", "secondMajor"]),
  program("math-minor", "minor", ["minor"]),
  program("reviewed-minor", "minor", ["minor"], "reviewed-nyush-overlay"),
  program("raw-ny", "minor", ["minor"], "raw-nyu-bulletin"),
];

const profile = { coreProgramId: "core", primaryMajorId: "cs", secondMajorId: null, minorIds: [] };

describe("ProgramProfileSheet", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("selects a distinct second major and multiple eligible minors", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<ProgramProfileSheet open onOpenChange={() => undefined} programs={programs} profile={profile} onSave={onSave} />);

    expect(screen.queryByText("raw-ny")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Second major (optional)"), "data");
    await user.click(screen.getByText("Mathematics Minor"));
    await user.click(screen.getByText("reviewed-minor"));
    expect(screen.getByText("Reviewed planner overlay")).toBeDefined();
    expect((screen.getByRole("button", { name: "Save Program Profile" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByText(/I understand that double-major/));
    await user.click(screen.getByRole("button", { name: "Save Program Profile" }));
    expect(onSave).toHaveBeenCalledWith({ coreProgramId: "core", primaryMajorId: "cs", secondMajorId: "data", minorIds: ["math-minor", "reviewed-minor"] });
  });

  it("removes a second major and prevents the primary from being duplicated", async () => {
    const user = userEvent.setup();
    const withSecond = { ...profile, secondMajorId: "data" };
    const onSave = vi.fn();
    render(<ProgramProfileSheet open onOpenChange={() => undefined} programs={programs} profile={withSecond} onSave={onSave} />);
    const second = screen.getAllByRole("combobox").find((element) => (element as HTMLSelectElement).value === "data")!;
    expect(Array.from((second as HTMLSelectElement).options).map((option) => option.value)).not.toContain("cs");
    await user.selectOptions(second, "");
    await user.click(screen.getByRole("button", { name: "Save Program Profile" }));
    expect(onSave).toHaveBeenCalledWith({ ...profile, secondMajorId: null });
  });

  it("filters programs and confirms before discarding unsaved changes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ProgramProfileSheet open onOpenChange={onOpenChange} programs={programs} profile={profile} onSave={() => undefined} />);
    await user.type(screen.getByRole("searchbox", { name: "Filter programs" }), "Data");
    expect(screen.getAllByRole("option", { name: "Data Science" })).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText("Primary major"), "data");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
