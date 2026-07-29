import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { PlanExportModel } from "@/lib/planExport/model";

const VIOLET: [number, number, number] = [87, 6, 140];
const DARK: [number, number, number] = [36, 31, 40];

export async function renderPlanPdf(model: PlanExportModel): Promise<Uint8Array> {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: false });
  doc.setProperties({ title: `NYUSH Degree Plan — Class of ${model.classYear}`, author: "NYUSH Course Planner" });
  doc.setTextColor(...VIOLET);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("NYUSH Degree Plan", 36, 42);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Class of ${model.classYear}  |  Entry ${model.startYear}  |  Exported ${new Date(model.generatedAt).toLocaleDateString("en-US")}`, 36, 62);
  doc.text(`Credits: ${model.credits.completed} completed / ${model.credits.planned} planned / ${model.credits.required} required`, 36, 78);
  doc.text(`Programs: ${model.profile.map((item) => `${item.role}: ${item.name}`).join("; ")}`, 36, 94, { maxWidth: 760 });

  const scheduleRows = model.semesters.flatMap((semester) =>
    semester.courses.length
      ? semester.courses.map((course) => [
          semester.term,
          semester.site,
          semester.completed ? "Yes" : "No",
          course.code,
          course.title,
          String(course.credits),
          course.expectedGrade ?? "—",
          course.allocations.join("; ") || "—",
        ])
      : [[semester.term, semester.site, semester.completed ? "Yes" : "No", "—", "No courses planned", "0", "—", "—"]],
  );
  autoTable(doc, {
    startY: 112,
    head: [["Term", "Site", "Done", "Code", "Course", "Cr", "Grade", "Allocation"]],
    body: scheduleRows,
    tableWidth: 657,
    theme: "striped",
    headStyles: { fillColor: VIOLET, textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4, overflow: "linebreak", textColor: DARK },
    columnStyles: { 0: { cellWidth: 66 }, 1: { cellWidth: 82 }, 2: { cellWidth: 32 }, 3: { cellWidth: 78 }, 4: { cellWidth: 210 }, 5: { cellWidth: 25 }, 6: { cellWidth: 34 }, 7: { cellWidth: 130 } },
    margin: { left: 36, right: 36 },
  });

  doc.addPage();
  doc.setTextColor(...VIOLET);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Requirement Progress", 36, 42);
  autoTable(doc, {
    startY: 56,
    head: [["Role", "Program", "Category", "Unit", "Required", "Planned", "Complete", "Status", "Remaining gaps"]],
    body: model.requirements.map((item) => [
      item.programRole, item.programName, item.categoryName, item.unitKind,
      String(item.required), String(item.planned), String(item.completed), item.status,
      item.gapSummary || "None",
    ]),
    tableWidth: 692,
    theme: "striped",
    headStyles: { fillColor: VIOLET, textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4, overflow: "linebreak", textColor: DARK },
    columnStyles: { 0: { cellWidth: 65 }, 1: { cellWidth: 110 }, 2: { cellWidth: 110 }, 3: { cellWidth: 42 }, 4: { cellWidth: 45 }, 5: { cellWidth: 45 }, 6: { cellWidth: 45 }, 7: { cellWidth: 50 }, 8: { cellWidth: 180 } },
    margin: { left: 36, right: 36 },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 80;
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Active advisement warnings", 36, finalY + 24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const warnings = model.warnings.length
    ? model.warnings.map((warning) => `• ${warning.severity.toUpperCase()}: ${warning.message}`).join("\n")
    : "No active warnings in this plan.";
  doc.text(warnings, 36, finalY + 38, { maxWidth: 760 });
  doc.setFontSize(7.5);
  doc.text(model.disclaimer, 36, Math.min(550, finalY + 82), { maxWidth: 760 });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(215, 211, 218);
    doc.line(36, 570, 806, 570);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(90, 85, 94);
    doc.text("NYUSH Degree Plan", 36, 584);
    doc.text(`Page ${page} of ${pageCount}`, 806, 584, { align: "right" });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
