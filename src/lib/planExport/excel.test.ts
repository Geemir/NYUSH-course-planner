import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { exportModelFixture } from "@/lib/planExport/fixture.test-helper";
import { renderPlanExcel } from "@/lib/planExport/excel";

describe("renderPlanExcel", () => {
  it("creates a typed three-sheet workbook without formula-like user cells", async () => {
    const bytes = await renderPlanExcel(exportModelFixture());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    expect(bytes.byteLength).toBeGreaterThan(2_000);
    expect(workbook.worksheets.map(({ name }) => name)).toEqual([
      "Overview", "Semester Plan", "Requirement Progress",
    ]);
    expect(workbook.getWorksheet("Overview")!.getCell("A1").value).toBe("NYUSH Degree Plan - Class of 2029");
    const semester = workbook.getWorksheet("Semester Plan")!;
    expect(semester.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(semester.autoFilter).toBeDefined();
    expect(semester.getCell("G2").value).toBe(4);
    expect(typeof semester.getCell("G2").value).toBe("number");
    expect(semester.getCell("F2").value).toBe("'=Unsafe title");
    expect(workbook.getWorksheet("Requirement Progress")!.getCell("K2").value).toBe("'+CSCI-SHU 210");
    expect(workbook.getWorksheet("Overview")!.getColumn("B").values).toContain("'-Review semester load");
  });
});
