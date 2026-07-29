import { describe, expect, it } from "vitest";
import { exportModelFixture } from "@/lib/planExport/fixture.test-helper";
import { renderPlanPdf } from "@/lib/planExport/pdf";

describe("renderPlanPdf", () => {
  it("creates a bounded A4 landscape PDF report", async () => {
    const bytes = await renderPlanPdf(exportModelFixture());
    const signature = new TextDecoder().decode(bytes.slice(0, 5));

    expect(signature).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(4_000);
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).toContain("NYUSH Degree Plan");
    expect(text).toContain("manual / completed");
    expect(text).toContain("=General Elective \\(tentative\\)");
    expect(text).toContain("Planning slots are tentative placeholders");
  });
});
