// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SamplePlanPreviewDialog } from "@/components/progress/SamplePlanPreviewDialog";
import type { CatalogClient } from "@/lib/catalogClient";
import type { BulletinSamplePlan } from "@/lib/bulletin/displayTypes";
import { render, screen } from "@/test/render";

const SAMPLE_PLAN: BulletinSamplePlan = {
  sectionId: "sampleplanofstudytext", heading: "Sample Plan of Study",
  terms: [{ sourceIndex: 0, heading: "1st Semester/Term", ordinal: 1, creditsText: "8", rows: [
    { kind: "course", sourceIndex: 0, text: "Calculus", creditsText: "4", linkedCourseCodes: ["MATH-SHU 131"], sourceAnchors: [] },
    { kind: "placeholder", sourceIndex: 1, label: "Chinese or EAP", creditsText: "4" },
  ] }],
  totalCreditsText: "8", importStatus: "eligible", diagnostics: [],
};

const record = {
  stableId: "nyu-shanghai:MATH-SHU 131", sourceId: "nyu-shanghai", sourceSnapshotId: "snapshot-1",
  code: "MATH-SHU 131", subject: "MATH-SHU", level: "undergraduate" as const,
  catalogOfferingTerms: [], catalogOfferingText: null, crossListedStableIds: [],
  course: { id: "MATH-SHU 131", title: "Calculus", credits: 4, department: "Mathematics", prereqs: [], sourceReferenceIds: [], offered: [], offeringKnown: false, sites: ["shanghai"], fulfills: [], equivalentTo: [], attributes: [], tags: [] },
};

describe("SamplePlanPreviewDialog", () => {
  it("resolves exact codes once, previews defaults, and applies selected rows", async () => {
    const user = userEvent.setup();
    const resolveCourseCodes = vi.fn(async () => ({ releaseId: "release-1", matches: [{ code: "MATH-SHU 131", records: [record] }] }));
    const client = { resolveCourseCodes } as unknown as CatalogClient;
    const onApply = vi.fn();
    render(<SamplePlanPreviewDialog open onOpenChange={() => undefined} programId="computer-science-bs" catalogReleaseId="release-1" samplePlan={SAMPLE_PLAN} placements={[]} planningSlots={[]} client={client} onApply={onApply} />);

    expect(await screen.findByText("Ready to add")).toBeDefined();
    expect(screen.getByText("Planning placeholder")).toBeDefined();
    expect(resolveCourseCodes).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Apply selected" }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ placements: [expect.objectContaining({ courseId: "MATH-SHU 131" })], slots: [expect.objectContaining({ label: "Chinese or EAP" })] }));
  });
});
