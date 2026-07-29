import type { PlanExportModel } from "@/lib/planExport/model";

export function exportModelFixture(): PlanExportModel {
  return {
    generatedAt: "2026-07-29T00:00:00.000Z",
    catalogReleaseId: "release-2026",
    startYear: 2025,
    classYear: 2029,
    profile: [
      { role: "core", id: "core", name: "NYUSH Core Curriculum" },
      { role: "primary-major", id: "cs", name: "Computer Science" },
      { role: "minor", id: "math-minor", name: "Mathematics Minor" },
    ],
    credits: { required: 128, planned: 32, completed: 16 },
    semesters: [
      {
        id: "Y1F", academicYear: "2025–26", term: "Fall 2025",
        site: "NYU Shanghai", completed: true, credits: 4,
        courses: [{
          code: "CSCI-SHU 101", title: "=Unsafe title", credits: 4,
          expectedGrade: "A-", allocations: ["Computer Science / Foundations"], resolved: true,
        }],
        slots: [{ label: "=General Elective", credits: 4, sourceProgramId: "cs", tentative: true }],
      },
      ...(["Y1S", "Y2F", "Y2S", "Y3F", "Y3S", "Y4F", "Y4S"] as const).map((id) => ({
        id, academicYear: "2025–26", term: id, site: "NYU Shanghai",
        completed: false, credits: 0, courses: [], slots: [],
      })),
    ],
    requirements: [{
      programId: "cs", programRole: "primary-major", programName: "Computer Science",
      categoryId: "foundations", categoryName: "Foundations", unitKind: "courses",
        required: 2, planned: 1, completed: 1, status: "missing", statusSource: "manual", manualStatus: "completed",
      gapSummary: "+CSCI-SHU 210",
    }],
    warnings: [{
      severity: "warning", kind: "underload", message: "-Review semester load",
      courseCode: null, semesterId: "Y1F",
    }],
    disclaimer: "This export is planning guidance. Confirm with your academic advisor. Planning slots are tentative placeholders and do not represent registered or completed courses.",
  };
}
