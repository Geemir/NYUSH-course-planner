// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulletinRequirements } from "@/components/progress/BulletinRequirements";
import type { BulletinRequirementDocument } from "@/lib/bulletin/displayTypes";
import { render, screen } from "@/test/render";

const display: BulletinRequirementDocument = {
  schemaVersion: 2,
  sourceUrl: "https://bulletins.nyu.edu/undergraduate/shanghai/programs/data-science-bs/",
  sections: [{
    id: "curriculumtext",
    heading: "Program Requirements",
    blocks: [{
      kind: "table",
      id: "major-requirements",
      caption: "Course List",
      headingTrail: [{ level: 3, text: "Probability" }],
      rows: [
        { sourceIndex: 0, role: "directive", text: "Select one of the following:", creditsText: "4", linkedCourseCodes: [], sourceAnchors: [], footnoteMarkers: [] },
        { sourceIndex: 1, role: "course", text: "Probability and Statistics", creditsText: null, linkedCourseCodes: ["MATH-SHU 235"], sourceAnchors: ["https://bulletins.nyu.edu/search/?P=MATH-SHU%20235"], footnoteMarkers: [] },
        { sourceIndex: 2, role: "course", text: "Honors Theory of Probability", creditsText: null, linkedCourseCodes: ["MATH-SHU 238"], sourceAnchors: [], footnoteMarkers: [] },
      ],
    }],
  }],
};

describe("BulletinRequirements", () => {
  it("renders source rows faithfully without structural manual controls", () => {
    render(<BulletinRequirements programId="data-science-bs" programName="Data Science" catalogReleaseId="release-1" sourceSnapshotId="snapshot-1" display={display} placements={[]} completedSemesters={[]} />);
    expect(screen.getAllByText("Select one of the following:").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/MATH-SHU 235.*Probability and Statistics/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /mark.*fulfilled/i })).toBeNull();
    expect(screen.getByRole("link", { name: /official bulletin/i }).getAttribute("href")).toBe(display.sourceUrl);
  });

  it("reports the exact source table and row", async () => {
    const user = userEvent.setup();
    const onReport = vi.fn();
    render(<BulletinRequirements programId="data-science-bs" programName="Data Science" catalogReleaseId="release-1" sourceSnapshotId="snapshot-1" display={display} placements={[]} completedSemesters={[]} onReport={onReport} />);
    await user.click(screen.getByRole("button", { name: /report.*MATH-SHU 235/i }));
    expect(onReport).toHaveBeenCalledWith(expect.objectContaining({ tableId: "major-requirements", sourceIndex: 1, displayedValue: expect.stringContaining("MATH-SHU 235") }));
  });
});
