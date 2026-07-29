import type { CatalogOverlayRow } from "@/db/schema";
import { CatalogCourseRecordSchema, type CatalogCourseRecord } from "@/lib/catalog/types";
import { CatalogProgramSchema, type CatalogProgram } from "@/lib/types";

export interface OverlayApplication<T> {
  value: T;
  deleted?: boolean;
  appliedOverlayIds: string[];
  provenance: Array<{ kind: "bulletin" | "reviewed-overlay"; referenceId: string; appliedAt?: string }>;
}

export class OverlayCarryForwardError extends Error {
  constructor(public readonly diagnostics: string[]) {
    super(`Reviewed overlays conflict with the candidate catalog: ${diagnostics.join("; ")}`);
    this.name = "OverlayCarryForwardError";
  }
}

const activeOrdered = (overlays: readonly CatalogOverlayRow[]) => overlays
  .filter((overlay) => overlay.status === "active" && !overlay.supersededAt)
  .toSorted((left, right) => left.appliedAt.getTime() - right.appliedAt.getTime() || left.id.localeCompare(right.id));

export function applyCourseOverlays(record: CatalogCourseRecord, overlays: readonly CatalogOverlayRow[]): OverlayApplication<CatalogCourseRecord> {
  let value = structuredClone(record);
  const applied: CatalogOverlayRow[] = [];
  for (const overlay of activeOrdered(overlays)) {
    const patch = overlay.patchData;
    if (patch.kind === "course") {
      if (patch.stableId !== record.stableId) continue;
      const { changes } = patch;
      value = {
        ...value,
        ...(changes.catalogOfferingTerms === undefined ? {} : { catalogOfferingTerms: [...changes.catalogOfferingTerms] }),
        ...(changes.catalogOfferingText === undefined ? {} : { catalogOfferingText: changes.catalogOfferingText }),
        crossListedStableIds: changes.crossListedStableIds ?? value.crossListedStableIds,
        course: {
          ...value.course,
          ...(changes.title === undefined ? {} : { title: changes.title }),
          ...(changes.description === undefined ? {} : { description: changes.description }),
          ...(changes.minCredits === undefined ? {} : { minCredits: changes.minCredits }),
          ...(changes.maxCredits === undefined ? {} : { maxCredits: changes.maxCredits }),
          ...(changes.attributes === undefined ? {} : { attributes: [...changes.attributes] }),
          ...(changes.prerequisiteText === undefined ? {} : { prerequisiteText: changes.prerequisiteText }),
          ...(changes.offered === undefined ? {} : { offered: [...changes.offered] }),
          ...(changes.offeringText === undefined ? {} : { offeringText: changes.offeringText ?? undefined }),
          ...(changes.offeringKnown === undefined ? {} : { offeringKnown: changes.offeringKnown }),
        },
      };
      applied.push(overlay);
    } else if (patch.kind === "course-delete" && patch.stableId === record.stableId) {
      applied.push(overlay);
    } else if (patch.kind === "requirement" && patch.courseStableId === record.stableId) {
      const mapping = { programId: patch.programId, categoryId: patch.requirementId };
      const fulfills = value.course.fulfills.filter((item) => !(item.programId === mapping.programId && item.categoryId === mapping.categoryId));
      if (patch.action === "add_fulfillment") fulfills.push(mapping);
      value = { ...value, course: { ...value.course, fulfills } };
      applied.push(overlay);
    }
  }
  const provenance = [
    { kind: "bulletin" as const, referenceId: record.sourceSnapshotId },
    ...applied.map((overlay) => ({ kind: "reviewed-overlay" as const, referenceId: overlay.id, appliedAt: overlay.appliedAt.toISOString() })),
  ];
  value = CatalogCourseRecordSchema.parse({ ...value, reviewedOverlayIds: applied.map((overlay) => overlay.id), overlayProvenance: provenance.filter((item) => item.kind === "reviewed-overlay") });
  return {
    value,
    deleted: applied.some((overlay) => overlay.patchData.kind === "course-delete"),
    appliedOverlayIds: applied.map((overlay) => overlay.id),
    provenance,
  };
}

export function applyProgramOverlays(programs: readonly CatalogProgram[], overlays: readonly CatalogOverlayRow[]): OverlayApplication<CatalogProgram[]> {
  const values = programs.map((program) => structuredClone(program));
  const applied: CatalogOverlayRow[] = [];
  for (const overlay of activeOrdered(overlays)) {
    const patch = overlay.patchData;
    if (patch.kind === "program-note") {
      const index = values.findIndex((program) => program.id === patch.programId);
      if (index < 0) continue;
      values[index] = CatalogProgramSchema.parse({ ...values[index], reviewedOverlayIds: [...(values[index].reviewedOverlayIds ?? []), overlay.id], reviewedNotes: [...(values[index].reviewedNotes ?? []), { note: patch.note, sourceUrl: patch.sourceUrl, overlayId: overlay.id }] });
      applied.push(overlay);
    } else if (patch.kind === "requirement" && patch.action === "note") {
      const index = values.findIndex((program) => program.id === patch.programId);
      if (index < 0 || !patch.note) continue;
      values[index] = CatalogProgramSchema.parse({
        ...values[index],
        reviewedOverlayIds: [...(values[index].reviewedOverlayIds ?? []), overlay.id],
        reviewedNotes: [...(values[index].reviewedNotes ?? []), {
          note: patch.note,
          sourceUrl: values[index].provenance.sourceUrl,
          overlayId: overlay.id,
        }],
      });
      applied.push(overlay);
    } else if (patch.kind === "reviewed-program") {
      if (values.some((program) => program.id === patch.program.id)) continue;
      values.push(CatalogProgramSchema.parse({ ...patch.program, reviewedOverlayIds: [...(patch.program.reviewedOverlayIds ?? []), overlay.id] }));
      applied.push(overlay);
    } else if (patch.kind === "requirement-upsert") {
      const index = values.findIndex((program) => program.id === patch.programId);
      if (index < 0) continue;
      const categories = values[index].categories.filter((category) => category.id !== patch.category.id);
      categories.push(structuredClone(patch.category));
      values[index] = CatalogProgramSchema.parse({
        ...values[index], categories,
        reviewedOverlayIds: [...(values[index].reviewedOverlayIds ?? []), overlay.id],
      });
      applied.push(overlay);
    } else if (patch.kind === "requirement-delete") {
      const index = values.findIndex((program) => program.id === patch.programId);
      if (index < 0) continue;
      values[index] = CatalogProgramSchema.parse({
        ...values[index],
        categories: values[index].categories.filter((category) => category.id !== patch.categoryId),
        reviewedOverlayIds: [...(values[index].reviewedOverlayIds ?? []), overlay.id],
      });
      applied.push(overlay);
    }
  }
  return {
    value: values,
    appliedOverlayIds: applied.map((overlay) => overlay.id),
    provenance: applied.map((overlay) => ({ kind: "reviewed-overlay", referenceId: overlay.id, appliedAt: overlay.appliedAt.toISOString() })),
  };
}

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/** Decides whether reviewed overlays can survive a candidate release without mutating either input. */
export function reconcileCatalogOverlays(
  courses: readonly CatalogCourseRecord[],
  programs: readonly CatalogProgram[],
  overlays: readonly CatalogOverlayRow[],
): { supersededOverlayIds: string[] } {
  const courseById = new Map(courses.map((course) => [course.stableId, course]));
  const programById = new Map(programs.map((program) => [program.id, program]));
  const supersededOverlayIds: string[] = [];
  const diagnostics: string[] = [];

  for (const overlay of activeOrdered(overlays)) {
    const patch = overlay.patchData;
    if (patch.kind === "course") {
      const course = courseById.get(patch.stableId);
      if (!course) {
        diagnostics.push(`${overlay.id}: course ${patch.stableId} disappeared`);
        continue;
      }
      const fields = Object.entries(patch.changes);
      const allResolved = fields.every(([key, expected]) => {
        const actual = key === "crossListedStableIds" || key === "catalogOfferingTerms" || key === "catalogOfferingText"
          ? course[key as "crossListedStableIds" | "catalogOfferingTerms" | "catalogOfferingText"]
          : course.course[key as keyof typeof course.course];
        return same(actual, expected);
      });
      if (allResolved) {
        supersededOverlayIds.push(overlay.id);
        continue;
      }
      const composed = applyCourseOverlays(course, [overlay]).value.course;
      const min = composed.minCredits ?? composed.credits;
      const max = composed.maxCredits ?? composed.credits;
      if (min > max) diagnostics.push(`${overlay.id}: reviewed credit range is invalid against new source truth`);
      continue;
    }

    if (patch.kind === "course-delete") {
      if (!courseById.has(patch.stableId)) supersededOverlayIds.push(overlay.id);
      continue;
    }

    if (patch.kind === "requirement") {
      const program = programById.get(patch.programId);
      const requirementExists = program?.categories.some((category) => category.id === patch.requirementId);
      const course = patch.courseStableId ? courseById.get(patch.courseStableId) : undefined;
      if (!program || !requirementExists || (patch.action !== "note" && !course)) {
        diagnostics.push(`${overlay.id}: requirement target no longer exists`);
        continue;
      }
      if (course && (patch.action === "add_fulfillment" || patch.action === "remove_fulfillment")) {
        const isMapped = course.course.fulfills.some((item) => item.programId === patch.programId && item.categoryId === patch.requirementId);
        if (isMapped === (patch.action === "add_fulfillment")) supersededOverlayIds.push(overlay.id);
      }
      continue;
    }

    if (patch.kind === "program-note") {
      if (!programById.has(patch.programId)) diagnostics.push(`${overlay.id}: program ${patch.programId} disappeared`);
      continue;
    }

    if (patch.kind === "requirement-upsert") {
      const program = programById.get(patch.programId);
      if (!program) diagnostics.push(`${overlay.id}: program ${patch.programId} disappeared`);
      else if (same(program.categories.find((category) => category.id === patch.category.id), patch.category)) supersededOverlayIds.push(overlay.id);
      continue;
    }

    if (patch.kind === "requirement-delete") {
      const program = programById.get(patch.programId);
      if (!program) diagnostics.push(`${overlay.id}: program ${patch.programId} disappeared`);
      else if (!program.categories.some((category) => category.id === patch.categoryId)) supersededOverlayIds.push(overlay.id);
      continue;
    }

    const sourceProgram = programById.get(patch.program.id);
    if (sourceProgram) {
      if (same(sourceProgram.categories, patch.program.categories)) supersededOverlayIds.push(overlay.id);
      else diagnostics.push(`${overlay.id}: source now defines a conflicting program ${patch.program.id}`);
    }
  }

  if (diagnostics.length) throw new OverlayCarryForwardError(diagnostics);
  return { supersededOverlayIds };
}
