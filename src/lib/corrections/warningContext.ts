import type { ReportIssueContext } from "@/components/corrections/ReportIssueDialog";
import { semesterTermName, type PlanWarning } from "@/lib/types";

export function warningReportContext(
  warning: PlanWarning,
  catalogReleaseId: string | null,
  startYear: number,
): ReportIssueContext {
  const subject = warning.courseId ?? (warning.semesterId ? semesterTermName(warning.semesterId, startYear) : "Plan");
  const details = [
    `Warning type: ${warning.kind}`,
    warning.courseId ? `Course: ${warning.courseId}` : null,
    warning.semesterId ? `Semester: ${semesterTermName(warning.semesterId, startYear)}` : null,
    `Message: ${warning.message}`,
  ].filter((line): line is string => Boolean(line));

  return {
    target: { kind: "other", area: "planner-warning" },
    catalogReleaseId,
    label: `Planning warning · ${subject}`,
    displayedValue: details.join("\n"),
  };
}
