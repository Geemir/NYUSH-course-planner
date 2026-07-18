// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProgramProfileMigrationDialog } from "@/components/programs/ProgramProfileMigrationDialog";
import type { PlanMigrationResult } from "@/lib/planMigration";
import type { CatalogProgram } from "@/lib/types";
import { render, screen } from "@/test/render";

const program = (id: string, type: CatalogProgram["type"]): CatalogProgram => ({
  id, name: id.toUpperCase(), shortName: id.toUpperCase(), type, categories: [], requirementRows: [], sourceRows: [], sourceReferenceIds: [],
  provenance: { sourceUrl: "https://bulletins.nyu.edu/", snapshotId: "s", sourceHash: "h" }, auditAuthority: "nyush-bulletin",
  eligibleProfileRoles: type === "core" ? ["core"] : type === "major" ? ["primaryMajor", "secondMajor"] : ["minor"],
});
const programs = [program("core", "core"), program("cs", "major"), program("data", "major"), program("math", "minor")];
const base: PlanMigrationResult = {
  status: "ready",
  issues: [],
  snapshot: { version: 2, catalogReleaseId: "release", placements: [], studyAway: {}, completedSemesters: [], programProfile: { coreProgramId: "core", primaryMajorId: "cs", secondMajorId: null, minorIds: [] }, unresolvedProgramIds: [], customCourses: [], fulfillmentFacts: [], dismissedWarnings: [], startYear: 2026 },
};

describe("ProgramProfileMigrationDialog", () => {
  it("requires explicit Continue even when automatic migration is ready", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(<ProgramProfileMigrationDialog open result={base} programs={programs} onCancel={() => undefined} onContinue={onContinue} onExportBackup={() => undefined} />);
    expect(onContinue).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue.mock.calls[0][0].status).toBe("ready");
  });

  it("preserves unknown programs until the user acknowledges later review", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    const result: PlanMigrationResult = { ...base, status: "needs-resolution", snapshot: { ...base.snapshot, unresolvedProgramIds: ["legacy-unknown"] }, issues: [{ code: "unresolved-program", value: "legacy-unknown", message: "Unknown", blocking: true }] };
    render(<ProgramProfileMigrationDialog open result={result} programs={programs} onCancel={() => undefined} onContinue={onContinue} onExportBackup={() => undefined} />);
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByText(/Keep these unresolved references/));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue.mock.calls[0][0].snapshot.unresolvedProgramIds).toEqual(["legacy-unknown"]);
  });

  it("supports changing major order, cancel, and backup export without saving", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onExportBackup = vi.fn();
    const onContinue = vi.fn();
    render(<ProgramProfileMigrationDialog open result={base} programs={programs} onCancel={onCancel} onContinue={onContinue} onExportBackup={onExportBackup} />);
    await user.selectOptions(screen.getByLabelText("Primary major"), "data");
    await user.click(screen.getByRole("button", { name: "Export backup" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onExportBackup).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onContinue).not.toHaveBeenCalled();
  });
});
