// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CourseMaintenanceEditor } from "@/components/admin/CourseMaintenanceEditor";
import { render, screen } from "@/test/render";

const record = {
  stableId: "nyu-shanghai:TEST-SHU 1", sourceId: "nyu-shanghai", sourceSnapshotId: "s", code: "TEST-SHU 1", subject: "TEST-SHU", level: "undergraduate" as const,
  catalogOfferingTerms: ["Fall"], catalogOfferingText: "Fall", crossListedStableIds: [],
  course: { id: "TEST-SHU 1", title: "Test", credits: 4, minCredits: 4, maxCredits: 4, department: "TEST-SHU", prereqs: [], prerequisiteText: "None", sourceReferenceIds: [], offered: ["fall" as const], offeringKnown: true, sites: ["shanghai"], fulfills: [], equivalentTo: [], attributes: [], tags: [] },
};

describe("CourseMaintenanceEditor", () => {
  it("publishes edited credits, prerequisites, and offering terms with a reason", async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn().mockResolvedValue(undefined);
    render(<CourseMaintenanceEditor record={record} onPublish={onPublish} />);
    await user.clear(screen.getByLabelText("Minimum credits"));
    await user.type(screen.getByLabelText("Minimum credits"), "2");
    await user.clear(screen.getByLabelText("Prerequisites"));
    await user.type(screen.getByLabelText("Prerequisites"), "TEST-SHU 0");
    await user.type(screen.getByLabelText("Reason for change"), "Confirmed in the current Bulletin.");
    await user.click(screen.getByRole("button", { name: "Publish course changes" }));
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({
      patch: expect.objectContaining({ kind: "course", stableId: record.stableId, changes: expect.objectContaining({ minCredits: 2, prerequisiteText: "TEST-SHU 0" }) }),
      reason: "Confirmed in the current Bulletin.",
    }));
  });
});
