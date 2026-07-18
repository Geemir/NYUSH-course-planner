import { createHash } from "node:crypto";
import type { BulletinSourceDocument } from "@/lib/bulletin/parseCoursePage";
import type {
  BulletinProgramDocument,
  SourceTableRow,
  SourceTableRowRole,
} from "@/lib/bulletin/parseProgramPage";
import type {
  CatalogCandidate,
  CatalogProgram,
  CatalogSourceRow,
  Course,
  RequirementNode,
} from "@/lib/types";
import type {
  CatalogSourceDefinition,
  SourceCatalogCandidate,
} from "@/lib/catalog/types";
import { catalogCourseStableId } from "@/lib/catalog/identity";

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
  | "provenance-source-mismatch"
  | "snapshot-id-mismatch"
  | "source-hash-mismatch"
  | "source-row-coverage"
  | "supported-ambiguity"
  | "unresolved-local-reference"
  | "source-id-mismatch"
  | "stable-id-mismatch"
  | "unexpected-program-source"
  | "graduate-record-included"
  | "ambiguous-record-included"
  | "course-count-drop"
  | "unresolved-reference-spike"
  | "zero-subjects"
  | "missing-course-code"
  | "missing-credit-value"
  | "invalid-canonical-url"
  | "structural-selector-miss";

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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function hasCanonicalSourceIdentity(
  kind: "subject" | "program" | "core",
  slugValue: string,
  sourceUrl: string,
): boolean {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugValue)) return false;
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return false;
  }
  const expectedPath =
    kind === "subject"
      ? `/undergraduate/shanghai/courses/${slugValue}/`
      : kind === "program"
        ? `/undergraduate/shanghai/programs/${slugValue}/`
        : "/undergraduate/shanghai/core-curriculum/";
  return (
    url.protocol === "https:" &&
    url.hostname === "bulletins.nyu.edu" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    url.pathname === expectedPath &&
    sourceUrl === `https://bulletins.nyu.edu${expectedPath}`
  );
}

function isSourceRow(value: unknown, expectedIndex: number): boolean {
  if (!isRecord(value)) return false;
  const allowedRoles = new Set([
    "areaHeader",
    "areaSubheader",
    "course",
    "comment",
    "total",
  ]);
  return (
    typeof value.role === "string" &&
    allowedRoles.has(value.role) &&
    value.sourceIndex === expectedIndex &&
    typeof value.text === "string" &&
    isOptionalString(value.creditsText) &&
    isStringArray(value.linkedCourseCodes) &&
    isStringArray(value.sourceAnchors) &&
    isStringArray(value.footnoteMarkers)
  );
}

function isSourceRows(value: unknown): boolean {
  return Array.isArray(value) && value.every(isSourceRow);
}

function isSubjectCourse(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === "string" &&
    value.code.trim() !== "" &&
    typeof value.title === "string" &&
    value.title.trim() !== "" &&
    isOptionalString(value.creditsText) &&
    isOptionalString(value.description) &&
    isOptionalString(value.offeringText) &&
    isOptionalString(value.prerequisiteText) &&
    isStringArray(value.linkedCourseIds) &&
    isStringArray(value.attributes) &&
    isStringArray(value.detailTexts)
  );
}

function isSourceSection(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.heading === "string" &&
    typeof value.text === "string" &&
    isStringArray(value.prose) &&
    isStringArray(value.tableIds)
  );
}

function isSourcePolicy(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.heading === "string" &&
    typeof value.text === "string"
  );
}

function isSourceFootnote(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.marker === "string" &&
    typeof value.text === "string"
  );
}

function isRequirementTable(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.trim() !== "" &&
    typeof value.sectionId === "string" &&
    isOptionalString(value.caption) &&
    isSourceRows(value.rows)
  );
}

function isSamplePlan(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.sectionId === "string" &&
    typeof value.heading === "string" &&
    Array.isArray(value.terms) &&
    value.terms.every(
      (term) =>
        isRecord(term) &&
        typeof term.id === "string" &&
        typeof term.heading === "string" &&
        isSourceRows(term.rows),
    )
  );
}

function isBulletinDocument(value: unknown): value is BulletinDocument {
  if (!isRecord(value)) return false;
  if (
    typeof value.slug === "string" &&
    value.slug.trim() !== "" &&
    typeof value.title === "string" &&
    typeof value.sourceUrl === "string" &&
    value.sourceUrl.trim() !== ""
  ) {
    // The kind-specific contracts below validate the remaining fields.
  } else {
    return false;
  }
  if (value.kind === "subject") {
    return (
      hasCanonicalSourceIdentity(value.kind, value.slug, value.sourceUrl) &&
      Array.isArray(value.courses) &&
      value.courses.length > 0 &&
      value.courses.every(isSubjectCourse) &&
      hasUniqueValues(
        value.courses.map((course) => (course as Record<string, unknown>).code as string),
      )
    );
  }
  if (value.kind !== "program" && value.kind !== "core") return false;
  return (
    (value.kind !== "core" || value.slug === "core-curriculum") &&
    hasCanonicalSourceIdentity(value.kind, value.slug, value.sourceUrl) &&
    Array.isArray(value.sections) &&
    value.sections.every(isSourceSection) &&
    Array.isArray(value.requirementTables) &&
    value.requirementTables.every(isRequirementTable) &&
    hasUniqueValues(
      value.requirementTables.map(
        (table) => (table as Record<string, unknown>).id as string,
      ),
    ) &&
    Array.isArray(value.policies) &&
    value.policies.every(isSourcePolicy) &&
    Array.isArray(value.footnotes) &&
    value.footnotes.every(isSourceFootnote) &&
    (value.samplePlan === undefined || isSamplePlan(value.samplePlan))
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

function slug(value: string): string {
  const result = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return result || "requirements";
}

function uniqueCategoryId(name: string, used: Map<string, number>): string {
  const base = slug(name);
  const sequence = (used.get(base) ?? 0) + 1;
  used.set(base, sequence);
  return sequence === 1 ? base : `${base}-${sequence}`;
}

function sourceRowGroups(rows: SourceTableRow[]): SourceTableRow[][] {
  const groups: SourceTableRow[][] = [];
  for (const row of rows) {
    if (row.role === "areaHeader" || groups.length === 0) groups.push([]);
    groups.at(-1)!.push(row);
  }
  return groups;
}

function semanticRowPaths(rows: SourceTableRow[]): Map<number, number[]> {
  const groups: SourceTableRow[][] = [];
  for (const row of rows) {
    if (row.role === "areaSubheader" || groups.length === 0) groups.push([]);
    groups.at(-1)!.push(row);
  }
  const paths = new Map<number, number[]>();
  groups.forEach((group, groupIndex) => {
    const directive =
      group.length > 1 &&
      group[0].role === "areaSubheader" &&
      (/^select one:?$/i.test(group[0].text) ||
        /^complete \d+(?:\.\d+)? credits from:?$/i.test(group[0].text));
    group.forEach((row, rowIndex) => {
      const localPath = directive
        ? rowIndex === 0
          ? []
          : [rowIndex - 1]
        : group.length === 1
          ? []
          : [rowIndex];
      paths.set(
        row.sourceIndex,
        groups.length === 1 ? localPath : [groupIndex, ...localPath],
      );
    });
  });
  return paths;
}

interface ExpectedCategorySource {
  id: string;
  name: string;
  sourceUrl: string;
  sourceTableId: string;
  sourceRowIndexes: number[];
}

function expectedCoverage(document: BulletinProgramDocument): {
  sourceRows: CatalogSourceRow[];
  categories: ExpectedCategorySource[];
} {
  const sourceRows: CatalogSourceRow[] = [];
  const categories: ExpectedCategorySource[] = [];
  const usedCategoryIds = new Map<string, number>();
  for (const table of document.requirementTables) {
    for (const group of sourceRowGroups(table.rows)) {
      const header = group.find((row) => row.role === "areaHeader");
      const categoryName = header?.text ?? table.caption ?? table.id;
      const categoryId = uniqueCategoryId(categoryName, usedCategoryIds);
      const semanticRows = group.filter(
        (row) => row.role !== "areaHeader" && row.role !== "total",
      );
      const nodePaths = semanticRowPaths(semanticRows);
      if (semanticRows.length > 0) {
        categories.push({
          id: categoryId,
          name: categoryName,
          sourceUrl: document.sourceUrl,
          sourceTableId: table.id,
          sourceRowIndexes: group.map((row) => row.sourceIndex),
        });
      }
      group.forEach((row) => {
        const common = {
          sourceUrl: document.sourceUrl,
          tableId: table.id,
          sourceIndex: row.sourceIndex,
          sourceText: row.text,
        };
        const representation = expectedRepresentation(row.role);
        if (representation === "categoryBoundary") {
          sourceRows.push({ representation, ...common, categoryId });
        } else if (representation === "publishedTotal") {
          sourceRows.push({
            representation,
            ...common,
            ...(row.creditsText ? { creditsText: row.creditsText } : {}),
          });
        } else {
          sourceRows.push({
            representation,
            ...common,
            categoryId,
            nodePath: nodePaths.get(row.sourceIndex) ?? [],
          });
        }
      });
    }
  }
  return { sourceRows, categories };
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
  const expected = expectedCoverage(document);
  if (expected.sourceRows.length !== program.sourceRows.length) return false;
  const expectedByKey = new Map(
    expected.sourceRows.map((row) => [
      rowKey(row.sourceUrl, row.tableId, row.sourceIndex),
      row,
    ] as const),
  );
  const actualByKey = new Map(
    program.sourceRows.map((row) => [
      rowKey(row.sourceUrl, row.tableId, row.sourceIndex),
      row,
    ] as const),
  );
  if (
    expectedByKey.size !== expected.sourceRows.length ||
    actualByKey.size !== program.sourceRows.length
  ) {
    return false;
  }
  if (
    [...expectedByKey].some(
      ([key, row]) => JSON.stringify(actualByKey.get(key)) !== JSON.stringify(row),
    )
  ) {
    return false;
  }

  const actualCategories = program.categories.map((category) => ({
    id: category.id,
    name: category.name,
    sourceUrl: category.sourceUrl,
    sourceTableId: category.sourceTableId,
    sourceRowIndexes: category.sourceRowIndexes,
  }));
  if (JSON.stringify(actualCategories) !== JSON.stringify(expected.categories)) {
    return false;
  }

  const expectedRequirements = expected.sourceRows.filter(
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
  const requirementPaths = program.requirementRows.map(
    (row) => `${row.categoryId}\u0000${JSON.stringify(row.nodePath)}`,
  );
  if (new Set(requirementPaths).size !== requirementPaths.length) return false;
  return expectedRequirements.every((expected) => {
    const key = rowKey(expected.sourceUrl, expected.tableId, expected.sourceIndex);
    const requirement = requirementsByKey.get(key);
    const category = program.categories.find(
      (candidate) => candidate.id === requirement?.categoryId,
    );
    const representedNode = category
      ? nodeAtPath(category.requirement, requirement?.nodePath ?? [])
      : undefined;
    return (
      requirement?.sourceText === expected.sourceText &&
      requirement.sourceUrl === expected.sourceUrl &&
      requirement.tableId === expected.tableId &&
      requirement.sourceIndex === expected.sourceIndex &&
      requirement.categoryId === expected.categoryId &&
      JSON.stringify(requirement.nodePath) === JSON.stringify(expected.nodePath) &&
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

function validationSummary(
  candidate: CatalogCandidate,
): SnapshotValidationSummary {
  return {
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
  };
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
  if (errors.length > 0) {
    return {
      summary: validationSummary(candidate),
      errors: sortDiagnostics(errors),
      warnings: [],
    };
  }

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

  const documentsByUrl = new Map<string, BulletinDocument[]>();
  documents.forEach((document) => {
    const values = documentsByUrl.get(document.sourceUrl) ?? [];
    values.push(document);
    documentsByUrl.set(document.sourceUrl, values);
  });
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
    const matchingDocuments = documentsByUrl.get(provenance.sourceUrl) ?? [];
    if (
      matchingDocuments.length > 0 &&
      (!matchingDocuments.some(
        (document) => provenance.sourceHash === hash(document),
      ) ||
        provenance.snapshotId !== candidate.snapshotId)
    ) {
      errors.push({
        code: "provenance-hash-mismatch",
        sourceUrl: provenance.sourceUrl,
        entityId: entity.id,
      });
    }
  });

  candidate.courses.forEach((course) => {
    const matchingDocuments = course.provenance
      ? (documentsByUrl.get(course.provenance.sourceUrl) ?? [])
      : [];
    if (
      !matchingDocuments.some(
        (document) =>
          document.kind === "subject" &&
          document.courses.some(
            (sourceCourse) =>
              sourceCourse.code === course.id && sourceCourse.title === course.title,
          ),
      )
    ) {
      errors.push({
        code: "provenance-source-mismatch",
        sourceUrl: course.provenance?.sourceUrl,
        entityId: course.id,
      });
    }
  });

  function programDocumentMatches(
    program: CatalogProgram,
    document: BulletinDocument,
  ): document is BulletinProgramDocument {
    const kindAndSlugMatch =
      program.type === "core"
        ? document.kind === "core" &&
          document.slug === "core-curriculum" &&
          program.id === "core"
        : document.kind === "program" && document.slug === program.id;
    return kindAndSlugMatch && document.title === program.name;
  }

  const coverageErrorUrls = new Set<string>();
  candidate.programs.forEach((program) => {
    const matchingDocuments = (
      documentsByUrl.get(program.provenance.sourceUrl) ?? []
    ).filter((document) => programDocumentMatches(program, document));
    if (matchingDocuments.length !== 1) {
      errors.push({
        code: "provenance-source-mismatch",
        sourceUrl: program.provenance.sourceUrl,
        entityId: program.id,
      });
      coverageErrorUrls.add(program.provenance.sourceUrl);
      return;
    }
    if (!hasExactSourceRowCoverage(program, matchingDocuments[0])) {
      coverageErrorUrls.add(program.provenance.sourceUrl);
    }
  });
  documents
    .filter(
      (document): document is BulletinProgramDocument =>
        document.kind === "program" || document.kind === "core",
    )
    .forEach((document) => {
      const matchingPrograms = candidate.programs.filter(
        (program) =>
          program.provenance.sourceUrl === document.sourceUrl &&
          programDocumentMatches(program, document),
      );
      if (matchingPrograms.length !== 1) {
        coverageErrorUrls.add(document.sourceUrl);
      }
    });
  [...coverageErrorUrls].sort(compareText).forEach((url) =>
    errors.push({ code: "source-row-coverage", sourceUrl: url }),
  );

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
      warnings.push({ code: "unresolved-local-reference", entityId: courseId });
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
    summary: validationSummary(candidate),
    errors: sortDiagnostics(errors),
    warnings: sortDiagnostics(warnings),
  };
}

export interface SourceValidationOptions {
  source: CatalogSourceDefinition;
  expectedSubjectCount: number;
  previousCourseCount?: number;
  previousUnresolvedCount?: number;
  maximumCourseDropRatio?: number;
  maximumUnresolvedIncrease?: number;
}

function canonicalSourceCourseUrl(
  value: string | undefined,
  source: CatalogSourceDefinition,
): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const index = new URL(source.courseIndexUrl);
    const remainder = url.pathname
      .slice(index.pathname.length)
      .replace(/\/+$/, "");
    return (
      url.origin === index.origin &&
      url.pathname.startsWith(index.pathname) &&
      url.search === "" &&
      url.hash === "" &&
      remainder !== "" &&
      !remainder.includes("/") &&
      value === `${index.origin}${index.pathname}${remainder}/`
    );
  } catch {
    return false;
  }
}

export function validateSourceCatalogCandidate(
  candidate: SourceCatalogCandidate,
  options: SourceValidationOptions,
): SnapshotValidationReport {
  const { source } = options;
  const errors: SnapshotValidationDiagnostic[] = [];
  const warnings: SnapshotValidationDiagnostic[] = [];
  const addError = (
    code: SnapshotValidationCode,
    entityId?: string,
    sourceUrl?: string,
  ) => errors.push({ code, ...(entityId ? { entityId } : {}), ...(sourceUrl ? { sourceUrl } : {}) });

  if (candidate.sourceId !== source.id) addError("source-id-mismatch", candidate.sourceId);
  if (source.campus === "new-york" && candidate.programs.length > 0) {
    addError("unexpected-program-source", source.id);
  }

  const subjectDocuments = candidate.documents.filter(
    (document): document is Record<string, unknown> =>
      isRecord(document) && document.kind === "subject",
  );
  if (subjectDocuments.length === 0) addError("zero-subjects", source.id);
  if (
    subjectDocuments.length < options.expectedSubjectCount ||
    subjectDocuments.some(
      (document) => !Array.isArray(document.courses) || document.courses.length === 0,
    )
  ) {
    addError("structural-selector-miss", source.id);
  }
  if (candidate.courses.length === 0) addError("empty-catalog", source.id);

  for (const record of candidate.courses) {
    if (record.sourceId !== source.id || record.sourceSnapshotId !== candidate.snapshotId) {
      addError("source-id-mismatch", record.code);
    }
    if (record.stableId !== catalogCourseStableId(source.id, record.code)) {
      addError("stable-id-mismatch", record.code);
    }
    if (record.level === "graduate") addError("graduate-record-included", record.code);
    if (record.level === "ambiguous") addError("ambiguous-record-included", record.code);
    if (record.code.trim() === "" || record.course.id !== record.code) {
      addError("missing-course-code", record.stableId);
    }
    if (
      !Number.isFinite(record.course.credits) ||
      record.course.credits < 0 ||
      (record.course.minCredits !== undefined &&
        !Number.isFinite(record.course.minCredits)) ||
      (record.course.maxCredits !== undefined &&
        !Number.isFinite(record.course.maxCredits))
    ) {
      addError("missing-credit-value", record.code);
    }
    if (!canonicalSourceCourseUrl(record.course.provenance?.sourceUrl, source)) {
      addError(
        "invalid-canonical-url",
        record.code,
        record.course.provenance?.sourceUrl,
      );
    }
  }

  const previousCourseCount = options.previousCourseCount ?? 0;
  const maximumDropRatio = options.maximumCourseDropRatio ?? 0.25;
  if (
    previousCourseCount > 0 &&
    candidate.courses.length < previousCourseCount * (1 - maximumDropRatio)
  ) {
    addError("course-count-drop", source.id);
  }
  const previousUnresolved = options.previousUnresolvedCount ?? 0;
  const maximumUnresolvedIncrease = options.maximumUnresolvedIncrease ?? 3;
  if (
    candidate.unresolvedCourseIds.length - previousUnresolved >
    maximumUnresolvedIncrease
  ) {
    addError("unresolved-reference-spike", source.id);
  }
  candidate.quarantinedCourses.forEach((course) =>
    warnings.push({
      code: "supported-ambiguity",
      entityId: course.code,
      sourceUrl: course.sourceUrl,
    }),
  );

  return {
    summary: {
      snapshotId: candidate.snapshotId,
      sourceHash: candidate.sourceHash,
      documentCount: candidate.documents.length,
      courseCount: candidate.courses.length,
      programCount: candidate.programs.length,
      sourceRowCount: 0,
      requirementRowCount: 0,
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
