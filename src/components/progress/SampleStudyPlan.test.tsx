// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { SampleStudyPlan } from "@/components/progress/SampleStudyPlan";
import type { BulletinSamplePlan } from "@/lib/bulletin/displayTypes";
import { render, screen } from "@/test/render";

export const SAMPLE_PLAN: BulletinSamplePlan = {
  sectionId: "sampleplanofstudytext",
  heading: "Sample Plan of Study",
  terms: Array.from({ length: 8 }, (_, index) => ({
    sourceIndex: index,
    heading: `${index + 1}${index === 0 ? "st" : index === 1 ? "nd" : index === 2 ? "rd" : "th"} Semester/Term`,
    ordinal: index + 1,
    creditsText: "4",
    rows: index === 0
      ? [
          { kind: "course" as const, sourceIndex: 0, text: "Calculus", creditsText: "4", linkedCourseCodes: ["MATH-SHU 131"], sourceAnchors: [] },
          { kind: "placeholder" as const, sourceIndex: 1, label: "Chinese or EAP", creditsText: "4" },
        ]
      : [],
  })),
  totalCreditsText: "128",
  importStatus: "eligible",
  diagnostics: [],
};

describe("SampleStudyPlan", () => {
  it("shows all source terms, exact courses, placeholders, and advisory copy", () => {
    render(<SampleStudyPlan programId="computer-science-bs" catalogReleaseId="release-1" samplePlan={SAMPLE_PLAN} />);
    SAMPLE_PLAN.terms.forEach((term) => expect(screen.getByText(term.heading)).toBeDefined());
    expect(screen.getByText(/MATH-SHU 131.*Calculus/)).toBeDefined();
    expect(screen.getByText("Chinese or EAP")).toBeDefined();
    expect(screen.getByText(/illustrative.*not a promise/i)).toBeDefined();
    expect(screen.getByRole("button", { name: "Use this sample plan" })).toBeDefined();
  });

  it("does not offer import for display-only source plans", () => {
    render(<SampleStudyPlan programId="computer-science-bs" catalogReleaseId="release-1" samplePlan={{ ...SAMPLE_PLAN, importStatus: "display-only" }} />);
    expect(screen.queryByRole("button", { name: "Use this sample plan" })).toBeNull();
  });
});
