import ExcelJS from "exceljs";
import type { PlanExportModel } from "@/lib/planExport/model";

const VIOLET = "FF57068C";
const VIOLET_LIGHT = "FFF3E8F8";
const NEUTRAL = "FFF6F5F7";
const WHITE = "FFFFFFFF";
const TEXT = "FF241F28";

function safeCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function styleHeader(row: ExcelJS.Row): void {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VIOLET } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}

function styleBody(sheet: ExcelJS.Worksheet, fromRow: number, toRow: number): void {
  for (let rowIndex = fromRow; rowIndex <= toRow; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    if (rowIndex % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NEUTRAL } };
      });
    }
    row.eachCell((cell) => {
      cell.font = { color: { argb: TEXT } };
      cell.alignment = { vertical: "top", wrapText: true };
    });
  }
}

function configureTable(
  sheet: ExcelJS.Worksheet,
  widths: number[],
  rowCount: number,
): void {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rowCount), column: widths.length } };
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  styleHeader(sheet.getRow(1));
  styleBody(sheet, 2, rowCount);
}

export async function renderPlanExcel(model: PlanExportModel): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NYUSH Course Planner";
  workbook.created = new Date(model.generatedAt);

  const overview = workbook.addWorksheet("Overview", { properties: { defaultRowHeight: 20 } });
  overview.columns = [{ width: 25 }, { width: 78 }];
  overview.addRow([`NYUSH Degree Plan - Class of ${model.classYear}`, ""]);
  overview.mergeCells("A1:B1");
  overview.addRows([
    ["Generated", model.generatedAt],
    ["Catalog release", model.catalogReleaseId ?? "Not recorded"],
    ["Entry year", model.startYear],
    ["Program profile", model.profile.map((item) => `${item.role}: ${safeCell(item.name)}`).join("\n")],
    ["Credits", `${model.credits.completed} completed / ${model.credits.planned} planned / ${model.credits.required} required`],
    ...model.warnings.map((warning) => [`${warning.severity.toUpperCase()} · ${warning.kind}`, safeCell(warning.message)]),
    ["Advising note", safeCell(model.disclaimer)],
  ]);
  const title = overview.getCell("A1");
  title.font = { bold: true, size: 18, color: { argb: WHITE } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VIOLET } };
  title.alignment = { vertical: "middle" };
  overview.getRow(1).height = 34;
  for (let index = 2; index <= overview.rowCount; index += 1) {
    overview.getCell(index, 1).font = { bold: true, color: { argb: VIOLET } };
    overview.getRow(index).alignment = { vertical: "top", wrapText: true };
    if (index % 2 === 0) {
      overview.getRow(index).eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VIOLET_LIGHT } };
      });
    }
  }

  const semesters = workbook.addWorksheet("Semester Plan", { properties: { defaultRowHeight: 20 } });
  semesters.addRow(["Academic Year", "Term", "Site", "Completed", "Course Code", "Course Title", "Credits", "Expected Grade", "Requirement Allocation"]);
  model.semesters.forEach((semester) => {
    semester.courses.forEach((course) => {
      semesters.addRow([
        semester.academicYear,
        semester.term,
        safeCell(semester.site),
        semester.completed ? "Yes" : "No",
        safeCell(course.code),
        safeCell(course.title),
        course.credits,
        course.expectedGrade ?? "",
        safeCell(course.allocations.join("; ")),
      ]);
    });
  });
  configureTable(semesters, [15, 15, 20, 12, 18, 34, 10, 15, 42], semesters.rowCount);

  const requirements = workbook.addWorksheet("Requirement Progress", { properties: { defaultRowHeight: 20 } });
  requirements.addRow(["Program Role", "Program", "Category", "Unit", "Required", "Planned", "Completed", "Status", "Program ID", "Category ID", "Remaining Gaps"]);
  model.requirements.forEach((item) => {
    requirements.addRow([
      item.programRole,
      safeCell(item.programName),
      safeCell(item.categoryName),
      item.unitKind,
      item.required,
      item.planned,
      item.completed,
      item.status,
      safeCell(item.programId),
      safeCell(item.categoryId),
      safeCell(item.gapSummary),
    ]);
  });
  configureTable(requirements, [18, 28, 28, 12, 12, 12, 12, 14, 18, 18, 48], requirements.rowCount);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
