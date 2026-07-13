import { createHash } from "node:crypto";
import type { BulletinSourceDocument } from "@/lib/bulletin/parseCoursePage";
import type {
  BulletinProgramDocument,
  SourceTableRowRole,
} from "@/lib/bulletin/parseProgramPage";
import type {
  CatalogCandidate,
  CatalogProgram,
  Course,
  RequirementNode,
} from "@/lib/types";

export type SnapshotValidationCode =
  | "broken-executable-reference"
  | "duplicate-course-id"
  | "duplicate-program-id"
  | "duplicate-source-id"
  | "empty-catalog"
  | "invalid-source-document"
  | "manual-confirmation"
  | "missing-discovered-page"
  | "missing-fetched-page"
  | "missing-title"
  | "provenance-hash-mismatch"
  | "snapshot-id-mismatch"
  | "source-hash-mismatch"
  | "source-row-coverage"
  | "supported-ambiguity"
  | "unresolved-local-reference";

export interface SnapshotValidationDiagnostic {
  code: SnapshotValidationCode;
  sourceUrl?: string;
  entityId?: string;
}

export interface SnapshotValidationSummary {
  snapshotId: string;
  sourceHash: string;
  documentCount: number;
  courseCount: number;
  programCount: number;
  sourceRowCount: number;
  requirementRowCount: number;
}

export interface SnapshotValidationReport {
  summary: SnapshotValidationSummary;
  errors: SnapshotValidationDiagnostic[];
  warnings: SnapshotValidationDiagnostic[];
}

type BulletinDocument = BulletinSourceDocument | BulletinProgramDocument;

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function hash(value: unknown): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? "[invalid-json-value]";
  } catch {
    serialized = "[invalid-json-value]";
  }
  return createHash("sha256").update(serialized).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBulletinDocument(value: unknown): value is BulletinDocument {
  if (!isRecord(value)) return false;
  const commonFields =
    typeof value.slug === "string" &&
    typeof value.title === "string" &&
    typeof value.sourceUrl === "string";
  if (!commonFields) return false;
  if (value.kind === "subject") return Array.isArray(value.courses);
  if (value.kind !== "program" && value.kind !== "core") return false;
  return (
    Array.isArray(value.requirementTables) &&
    value.requirementTables.every(
      (table) =>
        isRecord(table) &&
        typeof table.id === "string" &&
        Array.isArray(table.rows) &&
        table.rows.every(
          (row) =>
            isRecord(row) &&
            typeof row.role === "string" &&
            typeof row.sourceIndex === "number" &&
            typeof row.text === "string",
        ),
    )
  );
}

function isSerializableBulletinDocument(
  value: unknown,
): value is BulletinDocument {
  if (!isBulletinDocument(value)) return false;
  try {
    return JSON.stringify(value) !== undefined;
  } catch {
    return false;
  }
}

function canonicalDocuments(documents: readonly unknown[]): unknown[] {
  return [...documents].sort((left, right) => {
    const leftDocument = isBulletinDocument(left) ? left : undefined;
    const rightDocument = isBulletinDocument(right) ? right : undefined;
    const byUrl = compareText(
      leftDocument?.sourceUrl ?? "",
      rightDocument?.sourceUrl ?? "",
    );
    if (byUrl !== 0) return byUrl;
    const byKind = compareText(leftDocument?.kind ?? "", rightDocument?.kind ?? "");
    return byKind !== 0 ? byKind : compareText(hash(left), hash(right));
  });
}

function diagnosticKey(diagnostic: SnapshotValidationDiagnostic): string {
  return `${diagnostic.code}\u0000${diagnostic.sourceUrl ?? ""}\u0000${diagnostic.entityId ?? ""}`;
}

function sortDiagnostics(
  diagnostics: SnapshotValidationDiagnostic[],
): SnapshotValidationDiagnostic[] {
  return diagnostics.sort((left, right) =>
    compareText(diagnosticKey(left), diagnosticKey(right)),
  );
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort(compareText);
}

function expectedRepresentation(role: SourceTableRowRole) {
  if (role === "areaHeader") return "categoryBoundary" as const;
  if (role === "total") return "publishedTotal" as const;
  return "requirementNode" as const;
}

function rowKey(sourceUrlValue: string, tableId: string, sourceIndex: number) {
  return `${sourceUrlValue}\u0000${tableId}\u0000${sourceIndex}`;
}

function nodeAtPath(
  requirement: RequirementNode,
  path: readonly number[],
): RequirementNode | undefined {
  let node = requirement;
  for (const index of path) {
    if (
      node.kind !== "all" &&
      node.kind !== "any" &&
      node.kind !== "choose" &&
      node.kind !== "credits"
    ) {
      return undefined;
    }
    const child = node.children[index];
    if (!child) return undefined;
    node = child;
  }
  return node;
}

function hasExactSourceRowCoverage(
  program: CatalogProgram,
  document: BulletinProgramDocument,
): boolean {
  const expectedRows = document.requirementTables.flatMap((table) =>
    table.rows.map((row) => ({
      key: rowKey(document.sourceUrl, table.id, row.sourceIndex),
      sourceText: row.text,
      representation: expectedRepresentation(row.role),
    })),
  );
  const actualRows = program.sourceRows.map((row) => ({
    key: rowKey(row.sourceUrl, row.tableId, row.sourceIndex),
    sourceText: row.sourceText,
    representation: row.representation,
  }));
  if (expectedRows.length !== actualRows.length) return false;

  const expectedByKey = new Map(
    expectedRows.map((row) => [row.key, row] as const),
  );
  if (expectedByKey.size !== expectedRows.length) return false;
  const actualByKey = new Map(actualRows.map((row) => [row.key, row] as const));
  if (actualByKey.size !== actualRows.length) return false;

  for (const expected of expectedRows) {
    const actual = actualByKey.get(expected.key);
    if (
      !actual ||
      actual.sourceText !== expected.sourceText ||
      actual.representation !== expected.representation
    ) {
      return false;
    }
  }

  const expectedRequirements = expectedRows.filter(
    (row) => row.representation === "requirementNode",
  );
  if (program.requirementRows.length !== expectedRequirements.length) return false;
  const requirementsByKey = new Map(
    program.requirementRows.map((row) => [
      rowKey(row.sourceUrl, row.tableId, row.sourceIndex),
      row,
    ] as const),
  );
  if (requirementsByKey.size !== program.requirementRows.length) return false;
  const sourceRowsByKey = new Map(
    program.sourceRows.map((row) => [
      rowKey(row.sourceUrl, row.tableId, row.sourceIndex),
      row,
    ] as const),
  );
  return expectedRequirements.every((expected) => {
    const requirement = requirementsByKey.get(expected.key);
    const sourceRow = sourceRowsByKey.get(expected.key);
    const category = program.categories.find(
      (candidate) => candidate.id === requirement?.categoryId,
    );
    const representedNode = category
      ? nodeAtPath(category.requirement, requirement?.nodePath ?? [])
      : undefined;
    return (
      requirement?.sourceText === expected.sourceText &&
      sourceRow?.representation === "requirementNode" &&
      sourceRow.categoryId === requirement.categoryId &&
      JSON.stringify(sourceRow.nodePath) === JSON.stringify(requirement.nodePath) &&
      JSON.stringify(representedNode) === JSON.stringify(requirement.node)
    );
  });
}

function executableCourseIds(node: RequirementNode): string[] {
  switch (node.kind) {
    case "course":
      return [node.courseId];
    case "all":
    case "any":
    case "choose":
    case "credits":
      return node.children.flatMap(executableCourseIds);
    case "exclusion":
      return executableCourseIds(node.child);
    case "attribute":
    case "waiver":
    case "manualConfirmation":
      return [];
  }
}

function isLocalCourseId(courseId: string): boolean {
  return courseId.split(/\s+/, 1)[0].endsWith("-SHU");
}

function representedPrerequisiteIds(course: Course): Set<string> {
  return new Set((course.prereqs ?? []).flat());
}

function addDuplicateDiagnostics(
  errors: SnapshotValidationDiagnostic[],
  code:
    | "duplicate-course-id"
    | "duplicate-program-id"
    | "duplicate-source-id",
  values: readonly string[],
) {
  duplicates(values).forEach((entityId) => errors.push({ code, entityId }));
}

export function validateCatalogCandidate(
  candidate: CatalogCandidate,
): SnapshotValidationReport {
  const errors: SnapshotValidationDiagnostic[] = [];
  const warnings: SnapshotValidationDiagnostic[] = [];
  const documents = candidate.documents.filter(isSerializableBulletinDocument);
  const documentUrls = documents.map((document) => document.sourceUrl);

  candidate.documents.forEach((document, index) => {
    if (!isSerializableBulletinDocument(document)) {
      errors.push({
        code: "invalid-source-document",
        sourceUrl:
          isRecord(document) && typeof document.sourceUrl === "string"
            ? document.sourceUrl
            : undefined,
        entityId: String(index),
      });
    }
  });

  addDuplicateDiagnostics(
    errors,
    "duplicate-course-id",
    candidate.courses.map((course) => course.id),
  );
  addDuplicateDiagnostics(
    errors,
    "duplicate-program-id",
    candidate.programs.map((program) => program.id),
  );
  addDuplicateDiagnostics(errors, "duplicate-source-id", documentUrls);
  addDuplicateDiagnostics(
    errors,
    "duplicate-source-id",
    documents.map((document) => `${document.kind}:${document.slug}`),
  );

  if (candidate.courses.length === 0 || candidate.programs.length === 0) {
    errors.push({ code: "empty-catalog" });
  }

  candidate.courses.forEach((course) => {
    if (course.title.trim() === "") {
      errors.push({
        code: "missing-title",
        sourceUrl: course.provenance?.sourceUrl,
        entityId: course.id,
      });
    }
  });
  candidate.programs.forEach((program) => {
    if (program.name.trim() === "" || program.shortName.trim() === "") {
      errors.push({
        code: "missing-title",
        sourceUrl: program.provenance.sourceUrl,
        entityId: program.id,
      });
    }
  });
  documents.forEach((document) => {
    if (typeof document.title !== "string" || document.title.trim() === "") {
      errors.push({ code: "missing-title", sourceUrl: document.sourceUrl });
    }
  });

  const discoveredUrls = new Set<string>();
  candidate.courses.forEach((course) => {
    if (course.provenance) discoveredUrls.add(course.provenance.sourceUrl);
  });
  candidate.programs.forEach((program) =>
    discoveredUrls.add(program.provenance.sourceUrl),
  );
  const fetchedUrls = new Set(documentUrls);
  [...discoveredUrls].sort(compareText).forEach((url) => {
    if (!fetchedUrls.has(url)) {
      errors.push({ code: "missing-fetched-page", sourceUrl: url });
    }
  });
  [...fetchedUrls].sort(compareText).forEach((url) => {
    if (!discoveredUrls.has(url)) {
      errors.push({ code: "missing-discovered-page", sourceUrl: url });
    }
  });

  const documentByUrl = new Map(
    documents.map((document) => [document.sourceUrl, document] as const),
  );
  const expectedHash = hash(canonicalDocuments(candidate.documents));
  if (candidate.sourceHash !== expectedHash) {
    errors.push({ code: "source-hash-mismatch" });
  }
  if (candidate.snapshotId !== `bulletin-${expectedHash.slice(0, 24)}`) {
    errors.push({ code: "snapshot-id-mismatch" });
  }
  [...candidate.courses, ...candidate.programs].forEach((entity) => {
    const provenance = entity.provenance;
    if (!provenance) return;
    const document = documentByUrl.get(provenance.sourceUrl);
    if (
      document &&
      (provenance.sourceHash !== hash(document) ||
        provenance.snapshotId !== candidate.snapshotId)
    ) {
      errors.push({
        code: "provenance-hash-mismatch",
        sourceUrl: provenance.sourceUrl,
        entityId: entity.id,
      });
    }
  });

  const programsByUrl = new Map<string, CatalogProgram[]>();
  candidate.programs.forEach((program) => {
    const values = programsByUrl.get(program.provenance.sourceUrl) ?? [];
    values.push(program);
    programsByUrl.set(program.provenance.sourceUrl, values);
  });
  documents
    .filter(
      (document): document is BulletinProgramDocument =>
        document.kind === "program" || document.kind === "core",
    )
    .forEach((document) => {
      const matching = programsByUrl.get(document.sourceUrl) ?? [];
      if (
        matching.length !== 1 ||
        !hasExactSourceRowCoverage(matching[0], document)
      ) {
        errors.push({
          code: "source-row-coverage",
          sourceUrl: document.sourceUrl,
        });
      }
    });

  const localCourseIds = new Set(candidate.courses.map((course) => course.id));
  const allSourceReferences = new Set([
    ...candidate.sourceReferenceIds,
    ...candidate.unresolvedCourseIds,
    ...candidate.externalCourseIds,
    ...candidate.programs.flatMap((program) => program.sourceReferenceIds),
    ...candidate.courses.flatMap((course) => course.sourceReferenceIds ?? []),
  ]);
  [...allSourceReferences].sort(compareText).forEach((courseId) => {
    if (isLocalCourseId(courseId) && !localCourseIds.has(courseId)) {
      errors.push({ code: "unresolved-local-reference", entityId: courseId });
    }
  });

  const executableReferences = new Set([
    ...candidate.programs.flatMap((program) =>
      program.categories.flatMap((category) =>
        executableCourseIds(category.requirement),
      ),
    ),
    ...candidate.courses.flatMap((course) => (course.prereqs ?? []).flat()),
  ]);
  const explicitExternalIds = new Set(candidate.externalCourseIds);
  [...executableReferences].sort(compareText).forEach((courseId) => {
    if (
      !localCourseIds.has(courseId) &&
      (isLocalCourseId(courseId) || !explicitExternalIds.has(courseId))
    ) {
      errors.push({ code: "broken-executable-reference", entityId: courseId });
    }
  });

  candidate.programs.forEach((program) => {
    program.requirementRows.forEach((row) => {
      if (row.node.kind === "manualConfirmation") {
        warnings.push({
          code: "manual-confirmation",
          sourceUrl: row.sourceUrl,
          entityId: `${program.id}/${row.tableId}/${row.sourceIndex}`,
        });
      }
    });
  });
  candidate.courses.forEach((course) => {
    const sourceReferences = course.sourceReferenceIds ?? [];
    const represented = representedPrerequisiteIds(course);
    if (
      course.prerequisiteText &&
      sourceReferences.some((courseId) => !represented.has(courseId))
    ) {
      warnings.push({
        code: "supported-ambiguity",
        sourceUrl: course.provenance?.sourceUrl,
        entityId: course.id,
      });
    }
  });

  return {
    summary: {
      snapshotId: candidate.snapshotId,
      sourceHash: candidate.sourceHash,
      documentCount: candidate.documents.length,
      courseCount: candidate.courses.length,
      programCount: candidate.programs.length,
      sourceRowCount: candidate.programs.reduce(
        (count, program) => count + program.sourceRows.length,
        0,
      ),
      requirementRowCount: candidate.programs.reduce(
        (count, program) => count + program.requirementRows.length,
        0,
      ),
    },
    errors: sortDiagnostics(errors),
    warnings: sortDiagnostics(warnings),
  };
}

export class BulletinValidationError extends Error {
  readonly codes: SnapshotValidationCode[];

  constructor(codes: readonly SnapshotValidationCode[]) {
    const safeCodes = [...new Set(codes)].sort(compareText);
    super(`Bulletin snapshot is not publishable: ${safeCodes.join(", ")}.`);
    this.name = "BulletinValidationError";
    this.codes = safeCodes;
  }
}

export function assertPublishable(report: SnapshotValidationReport): void {
  if (report.errors.length > 0) {
    throw new BulletinValidationError(
      report.errors.map((diagnostic) => diagnostic.code),
    );
  }
}
