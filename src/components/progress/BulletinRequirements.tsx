"use client";

import { CheckCircle2, Circle, ExternalLink, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  BulletinDisplayRow,
  BulletinRequirementDocument,
} from "@/lib/bulletin/displayTypes";
import type { PlanPlacementV2, SemesterId } from "@/lib/types";

export interface BulletinReportContext {
  tableId: string;
  sourceIndex: number;
  displayedValue: string;
}

interface BulletinRequirementsProps {
  programId: string;
  programName: string;
  catalogReleaseId: string | null;
  sourceSnapshotId?: string;
  display: BulletinRequirementDocument;
  placements: readonly PlanPlacementV2[];
  completedSemesters: readonly SemesterId[];
  onReport?(context: BulletinReportContext): void;
}

function rowLabel(row: BulletinDisplayRow): string {
  return [...row.linkedCourseCodes, row.text].filter(Boolean).join(" · ");
}

function rowStatus(
  row: BulletinDisplayRow,
  placements: readonly PlanPlacementV2[],
  completedSemesters: readonly SemesterId[],
): "completed" | "planned" | null {
  const codes = new Set(row.linkedCourseCodes);
  const placement = placements.find((item) => codes.has(item.courseId));
  if (!placement) return null;
  return completedSemesters.includes(placement.semesterId)
    ? "completed"
    : "planned";
}

function SourceRow({
  row,
  tableId,
  placements,
  completedSemesters,
  onReport,
}: {
  row: BulletinDisplayRow;
  tableId: string;
  placements: readonly PlanPlacementV2[];
  completedSemesters: readonly SemesterId[];
  onReport?: BulletinRequirementsProps["onReport"];
}) {
  const status = rowStatus(row, placements, completedSemesters);
  const label = rowLabel(row);
  const structural = row.role === "heading" || row.role === "directive";
  return (
    <tr
      className={
        structural
          ? "bg-muted/55 font-medium"
          : row.role === "total"
            ? "border-t-2 font-semibold"
            : "align-top"
      }
    >
      <th
        scope="row"
        className="px-3 py-3 text-left text-sm font-[inherit] sm:w-[70%]"
      >
        <span className="flex items-start gap-2">
          {row.role === "course" &&
            (status === "completed" ? (
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            ) : (
              <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            ))}
          <span className="min-w-0">
            <span className={row.linkedCourseCodes.length ? "font-medium" : ""}>
              {label}
            </span>
            {row.footnoteMarkers.length > 0 && (
              <sup className="ml-1 text-xs text-muted-foreground">
                {row.footnoteMarkers.join(", ")}
              </sup>
            )}
            {status && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {status === "completed" ? "Completed" : "Planned"}
              </span>
            )}
          </span>
        </span>
      </th>
      <td className="px-3 py-3 text-right text-sm tabular-nums text-muted-foreground max-sm:text-left">
        {row.creditsText ?? "—"}
      </td>
      <td className="w-12 px-2 py-2 text-right">
        {onReport && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={`Report ${label}`}
            onClick={() =>
              onReport({ tableId, sourceIndex: row.sourceIndex, displayedValue: label })
            }
          >
            <Flag aria-hidden="true" className="size-4" />
          </Button>
        )}
      </td>
    </tr>
  );
}

export function BulletinRequirements({
  display,
  placements,
  completedSemesters,
  onReport,
}: BulletinRequirementsProps) {
  return (
    <section className="space-y-5" aria-labelledby="bulletin-requirements-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="bulletin-requirements-heading" className="text-base font-semibold">
            Bulletin requirements
          </h3>
          <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
            Source-faithful rows from the official Bulletin. Headings and directives
            describe the courses beneath them; they are not separate requirements.
          </p>
        </div>
        <a
          href={display.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Open official Bulletin <ExternalLink aria-hidden="true" className="size-4" />
        </a>
      </div>

      {display.sections.map((section) => (
        <section key={section.id} className="space-y-4">
          {section.heading && <h4 className="text-sm font-semibold">{section.heading}</h4>}
          {section.blocks.map((block, blockIndex) => {
            if (block.kind === "heading") {
              return <h5 key={`${block.text}:${blockIndex}`} className="text-sm font-semibold">{block.text}</h5>;
            }
            if (block.kind === "prose") {
              return (
                <div key={`prose:${blockIndex}`} className="max-w-[70ch] space-y-2 text-sm leading-6 text-muted-foreground">
                  {block.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              );
            }
            return (
              <div key={block.id} className="overflow-x-auto rounded-xl bg-card ring-1 ring-border">
                <table className="w-full min-w-[36rem] border-collapse">
                  <caption className="px-3 py-3 text-left text-sm font-semibold">
                    {block.headingTrail.at(-1)?.text ?? block.caption ?? "Course List"}
                    {block.caption && block.headingTrail.at(-1)?.text !== block.caption && (
                      <span className="ml-2 font-normal text-muted-foreground">{block.caption}</span>
                    )}
                  </caption>
                  <thead>
                    <tr className="border-y bg-muted/30 text-xs text-muted-foreground">
                      <th scope="col" className="px-3 py-2 text-left font-medium">Requirement or course</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Credits</th>
                      <th scope="col" className="px-2 py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {block.rows.map((row) => (
                      <SourceRow key={row.sourceIndex} row={row} tableId={block.id} placements={placements} completedSemesters={completedSemesters} onReport={onReport} />
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>
      ))}
    </section>
  );
}
