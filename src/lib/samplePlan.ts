import type { BulletinSamplePlan } from "@/lib/bulletin/displayTypes";
import { canonicalCourseCode } from "@/lib/catalog/identity";
import type { CatalogCourseResolveResponse } from "@/lib/catalog/contracts";
import type { CatalogCourseRecord } from "@/lib/catalog/types";
import type {
  PlanPlacementV2,
  PlanningSlot,
  SemesterId,
} from "@/lib/types";
import { SEMESTER_IDS } from "@/lib/types";
import type {
  SamplePlanChangeSet,
  SamplePlanPlacementInput,
} from "@/store/plannerStore";

export type SamplePlanPreviewStatus =
  | "add"
  | "keep"
  | "conflict"
  | "placeholder"
  | "unavailable";
export type SamplePlanSelectionAction =
  | "add"
  | "move"
  | "slot"
  | "skip";

export interface SlotSourceIdentity {
  programId: string;
  sectionId: string;
  termOrdinal: number;
  rowSourceIndex: number;
  label: string;
}

export interface SamplePlanPreviewRow {
  sourceKey: string;
  termSourceIndex: number;
  rowSourceIndex: number;
  semesterId: SemesterId | null;
  label: string;
  credits: number | null;
  courseCode: string | null;
  status: SamplePlanPreviewStatus;
  defaultAction: SamplePlanSelectionAction;
  record: CatalogCourseRecord | null;
  existingPlacement: PlanPlacementV2 | null;
  existingSlot: PlanningSlot | null;
  unavailableReason: string | null;
}

export interface SamplePlanPreviewTerm {
  sourceIndex: number;
  heading: string;
  ordinal: number | null;
  semesterId: SemesterId | null;
  creditsText: string | null;
  rows: SamplePlanPreviewRow[];
}

export interface SamplePlanPreview {
  programId: string;
  catalogReleaseId: string;
  sectionId: string;
  heading: string;
  terms: SamplePlanPreviewTerm[];
}

export interface BuildSamplePlanPreviewInput {
  programId: string;
  catalogReleaseId: string;
  samplePlan: BulletinSamplePlan;
  resolution: CatalogCourseResolveResponse;
  placements: readonly PlanPlacementV2[];
  planningSlots: readonly PlanningSlot[];
}

function normalizedLabel(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "slot"
  );
}

function numericCredits(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function samplePlanSemester(ordinal: number): SemesterId | null {
  return ordinal >= 1 && ordinal <= SEMESTER_IDS.length
    ? SEMESTER_IDS[ordinal - 1]
    : null;
}

export function planningSlotSourceKey(input: SlotSourceIdentity): string {
  return [
    input.programId,
    input.sectionId,
    input.termOrdinal,
    input.rowSourceIndex,
    normalizedLabel(input.label),
  ].join(":");
}

function resolvedRecord(
  code: string,
  records: readonly CatalogCourseRecord[],
): CatalogCourseRecord | null {
  const canonical = canonicalCourseCode(code);
  const exact = records.filter(
    (record) => canonicalCourseCode(record.code) === canonical,
  );
  const subject = canonical.split(/\s+/, 1)[0];
  if (subject.endsWith("-SHU")) {
    const shanghai = exact.filter((record) => record.sourceId === "nyu-shanghai");
    if (shanghai.length === 1) return shanghai[0];
    if (shanghai.length > 1) return null;
  }
  return exact.length === 1 ? exact[0] : null;
}

function sourceKey(
  input: BuildSamplePlanPreviewInput,
  ordinal: number,
  rowSourceIndex: number,
  label: string,
): string {
  return planningSlotSourceKey({
    programId: input.programId,
    sectionId: input.samplePlan.sectionId,
    termOrdinal: ordinal,
    rowSourceIndex,
    label,
  });
}

export function buildSamplePlanPreview(
  input: BuildSamplePlanPreviewInput,
): SamplePlanPreview {
  if (input.resolution.releaseId !== input.catalogReleaseId) {
    throw new Error("Sample-plan resolution belongs to a different catalog release.");
  }
  const recordsByCode = new Map(
    input.resolution.matches.map((match) => [
      canonicalCourseCode(match.code),
      match.records,
    ]),
  );
  return {
    programId: input.programId,
    catalogReleaseId: input.catalogReleaseId,
    sectionId: input.samplePlan.sectionId,
    heading: input.samplePlan.heading,
    terms: input.samplePlan.terms.map((term) => {
      const semesterId = term.ordinal ? samplePlanSemester(term.ordinal) : null;
      return {
        sourceIndex: term.sourceIndex,
        heading: term.heading,
        ordinal: term.ordinal,
        semesterId,
        creditsText: term.creditsText,
        rows: term.rows.map((row): SamplePlanPreviewRow => {
          const label = row.kind === "placeholder" ? row.label : row.text;
          const key = sourceKey(
            input,
            term.ordinal ?? term.sourceIndex + 1,
            row.sourceIndex,
            label,
          );
          if (row.kind === "placeholder") {
            const existingSlot =
              input.planningSlots.find((slot) => slot.sourceKey === key) ?? null;
            return {
              sourceKey: key,
              termSourceIndex: term.sourceIndex,
              rowSourceIndex: row.sourceIndex,
              semesterId,
              label,
              credits: numericCredits(row.creditsText),
              courseCode: null,
              status: existingSlot
                ? "keep"
                : semesterId
                  ? "placeholder"
                  : "unavailable",
              defaultAction:
                !existingSlot && semesterId ? "slot" : "skip",
              record: null,
              existingPlacement: null,
              existingSlot,
              unavailableReason: semesterId ? null : "Term ordinal is unavailable.",
            };
          }

          const codes = row.linkedCourseCodes.map(canonicalCourseCode);
          const code = codes.length === 1 ? codes[0] : null;
          const record = code
            ? resolvedRecord(code, recordsByCode.get(code) ?? [])
            : null;
          const existingPlacement = record
            ? input.placements.find(
                (placement) =>
                  placement.catalogCourseId === record.stableId ||
                  canonicalCourseCode(placement.courseId) ===
                    canonicalCourseCode(record.code),
              ) ?? null
            : null;
          const status: SamplePlanPreviewStatus =
            !semesterId || !record
              ? "unavailable"
              : existingPlacement?.semesterId === semesterId
                ? "keep"
                : existingPlacement
                  ? "conflict"
                  : "add";
          return {
            sourceKey: key,
            termSourceIndex: term.sourceIndex,
            rowSourceIndex: row.sourceIndex,
            semesterId,
            label,
            credits: numericCredits(row.creditsText),
            courseCode: code,
            status,
            defaultAction: status === "add" ? "add" : "skip",
            record,
            existingPlacement,
            existingSlot: null,
            unavailableReason:
              !semesterId
                ? "Term ordinal is unavailable."
                : !record
                  ? "The exact course code is not unambiguous in this release."
                  : null,
          };
        }),
      };
    }),
  };
}

export function defaultSamplePlanSelections(
  preview: SamplePlanPreview,
): Record<string, SamplePlanSelectionAction> {
  return Object.fromEntries(
    preview.terms.flatMap((term) =>
      term.rows.map((row) => [row.sourceKey, row.defaultAction]),
    ),
  );
}

function placementChange(row: SamplePlanPreviewRow): SamplePlanPlacementInput {
  if (!row.record || !row.semesterId) {
    throw new Error("Only resolved course rows can create placement changes.");
  }
  return {
    courseId: row.record.course.id,
    catalogCourseId: row.record.stableId,
    titleSnapshot: row.record.course.title.slice(0, 200),
    semesterId: row.semesterId,
  };
}

export function selectedSamplePlanChanges(
  preview: SamplePlanPreview,
  selections: Readonly<Record<string, SamplePlanSelectionAction>>,
): SamplePlanChangeSet {
  const placements: SamplePlanPlacementInput[] = [];
  const slots: PlanningSlot[] = [];
  for (const term of preview.terms) {
    for (const row of term.rows) {
      const action = selections[row.sourceKey] ?? row.defaultAction;
      if (action === "add" && row.status === "add") {
        placements.push(placementChange(row));
      } else if (
        action === "move" &&
        row.status === "conflict" &&
        row.existingPlacement
      ) {
        placements.push({
          ...placementChange(row),
          placementId: row.existingPlacement.placementId,
          allocation: row.existingPlacement.allocation,
          ...(row.existingPlacement.selectedCredits === undefined
            ? {}
            : { selectedCredits: row.existingPlacement.selectedCredits }),
          ...(row.existingPlacement.expectedGrade === undefined
            ? {}
            : { expectedGrade: row.existingPlacement.expectedGrade }),
        });
      } else if (
        action === "slot" &&
        row.status === "placeholder" &&
        row.semesterId
      ) {
        slots.push({
          id: `sample-slot:${row.sourceKey}`,
          sourceKey: row.sourceKey,
          semesterId: row.semesterId,
          label: row.label,
          credits: row.credits,
          source: {
            kind: "bulletin-sample-plan",
            programId: preview.programId,
            catalogReleaseId: preview.catalogReleaseId,
            sectionId: preview.sectionId,
            termSourceIndex: row.termSourceIndex,
            rowSourceIndex: row.rowSourceIndex,
          },
        });
      }
    }
  }
  return { placements, slots };
}
