import { describe, expect, it } from "vitest";
import { warningReportContext } from "@/lib/corrections/warningContext";

describe("warningReportContext", () => {
  it("preserves warning, course, semester, and catalog release context", () => {
    const context = warningReportContext({
      id: "not-offered:TEST 1:Y2S",
      kind: "not-offered",
      severity: "warning",
      courseId: "TEST 1",
      semesterId: "Y2S",
      message: "TEST 1 is not usually offered in spring.",
    }, "release-7", 2025);

    expect(context).toMatchObject({
      target: { kind: "other", area: "planner-warning" },
      catalogReleaseId: "release-7",
      label: "Planning warning · TEST 1",
    });
    expect(context.displayedValue).toContain("Spring 2027");
    expect(context.displayedValue).toContain("not-offered");
    expect(context.displayedValue).toContain("TEST 1 is not usually offered");
  });
});
