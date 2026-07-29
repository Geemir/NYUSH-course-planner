import { createHash } from "node:crypto";
import {
  BulletinRequirementDocumentSchema,
  BulletinSamplePlanSchema,
  type BulletinDisplayRow,
  type BulletinTableBlock,
} from "@/lib/bulletin/displayTypes";
import type { BulletinSourceDocument } from "@/lib/bulletin/parseCoursePage";
import type {
  BulletinProgramDocument,
  SourceTableRow,
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
  | "structural-selector-miss"
  | "selector-manual-confirmation"
  | "invalid-choose-cardinality"
  | "generic-category-name"
  | "duplicate-source-reference"
  | "unavailable-interpretation"
  | "credit-mismatch"
  | "display-row-fidelity"
  | "sample-plan-fidelity"
  | "unexpected-manual-condition";

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
    (value.headingTrail === undefined ||
      (Array.isArray(value.headingTrail) &&
        value.headingTrail.every(
          (heading) =>
            isRecord(heading) &&
            typeof heading.level === "number" &&
            heading.level >= 2 &&
            heading.level <= 6 &&
            typeof heading.text === "string",
        ))) &&
    isSourceRows(value.rows)
  );
}

function isSamplePlan(value: unknown): boolean {
  return BulletinSamplePlanSchema.safeParse(value).success;
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
    (value.bulletinDisplay === undefined ||
      BulletinRequirementDocumentSchema.safeParse(value.bulletinDisplay).success) &&
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
  const tableById = new Map(
    document.requirementTables.map((table) => [table.id, table]),
  );
  const sourceRow = (tableId: string, sourceIndex: number) =>
    tableById
      .get(tableId)
      ?.rows.find((candidate) => candidate.sourceIndex === sourceIndex);
  const verified = program.interpretations.filter(
    (interpretation) =>
      interpretation.status === "verified" && interpretation.requirement,
  );
  const expectedCategories = verified.map((interpretation) => ({
    id: interpretation.id,
    name: interpretation.name,
    requirement: interpretation.requirement,
    sourceUrl: document.sourceUrl,
    sourceTableId: interpretation.sourceTableIds[0],
    sourceRowIndexes: interpretation.sourceRowRefs.map(
      (reference) => reference.sourceIndex,
    ),
  }));
  if (JSON.stringify(program.categories) !== JSON.stringify(expectedCategories)) {
    return false;
  }

  const expectedRows = new Map<
    string,
    { representation: CatalogSourceRow["representation"]; categoryId?: string }
  >();
  for (const table of document.requirementTables) {
    for (const row of table.rows) {
      if (row.role === "total") {
        expectedRows.set(rowKey(document.sourceUrl, table.id, row.sourceIndex), {
          representation: "publishedTotal",
        });
      }
    }
  }
  const expectedRequirementKeys = new Set<string>();
  for (const interpretation of verified) {
    for (const reference of interpretation.sourceRowRefs) {
      const row = sourceRow(reference.tableId, reference.sourceIndex);
      if (!row) return false;
      const key = rowKey(
        document.sourceUrl,
        reference.tableId,
        reference.sourceIndex,
      );
      if (row.role === "areaHeader") {
        expectedRows.set(key, {
          representation: "categoryBoundary",
          categoryId: interpretation.id,
        });
      } else if (row.role !== "total") {
        expectedRows.set(key, {
          representation: "requirementNode",
          categoryId: interpretation.id,
        });
        expectedRequirementKeys.add(key);
      }
    }
  }

  const actualByKey = new Map(
    program.sourceRows.map((row) => [
      rowKey(row.sourceUrl, row.tableId, row.sourceIndex),
      row,
    ] as const),
  );
  if (
    expectedRows.size !== program.sourceRows.length ||
    actualByKey.size !== program.sourceRows.length
  ) {
    return false;
  }
  for (const [key, expected] of expectedRows) {
    const actual = actualByKey.get(key);
    if (!actual || actual.representation !== expected.representation) return false;
    const source = sourceRow(actual.tableId, actual.sourceIndex);
    if (!source || actual.sourceText !== source.text) return false;
    if (
      "categoryId" in actual &&
      actual.categoryId !== expected.categoryId
    ) {
      return false;
    }
    if (
      actual.representation === "publishedTotal" &&
      actual.creditsText !== source.creditsText
    ) {
      return false;
    }
  }

  if (program.requirementRows.length !== expectedRequirementKeys.size) return false;
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
  return [...expectedRequirementKeys].every((key) => {
    const requirement = requirementsByKey.get(key);
    if (!requirement) return false;
    const source = sourceRow(requirement.tableId, requirement.sourceIndex);
    const category = program.categories.find(
      (candidate) => candidate.id === requirement.categoryId,
    );
    const representedNode = category
      ? nodeAtPath(category.requirement, requirement.nodePath)
      : undefined;
    return (
      source !== undefined &&
      requirement.sourceText === source.text &&
      requirement.sourceUrl === document.sourceUrl &&
      JSON.stringify(representedNode) === JSON.stringify(requirement.node)
    );
  });
}

function displayRole(row: SourceTableRow): BulletinDisplayRow["role"] {
  if (row.role === "total") return "total";
  if (row.linkedCourseCodes.length > 0) return "course";
  if (/^(?:select|choose|complete)\b/i.test(row.text)) return "directive";
  if (row.role === "areaHeader" || row.role === "areaSubheader") {
    return "heading";
  }
  return "note";
}

function displayTables(document: BulletinProgramDocument): BulletinTableBlock[] {
  return document.bulletinDisplay?.sections.flatMap((section) =>
    section.blocks.filter(
      (block): block is BulletinTableBlock => block.kind === "table",
    ),
  ) ?? [];
}

function hasDisplayFidelity(
  program: CatalogProgram,
  document: BulletinProgramDocument,
): boolean {
  if (
    !document.bulletinDisplay ||
    !BulletinRequirementDocumentSchema.safeParse(document.bulletinDisplay).success ||
    document.bulletinDisplay.sourceUrl !== document.sourceUrl ||
    JSON.stringify(program.bulletinDisplay) !==
      JSON.stringify(document.bulletinDisplay)
  ) {
    return false;
  }
  const displayed = displayTables(document);
  if (displayed.length !== document.requirementTables.length) return false;
  return document.requirementTables.every((table, tableIndex) => {
    const block = displayed[tableIndex];
    return (
      block.id === table.id &&
      block.caption === (table.caption ?? null) &&
      JSON.stringify(block.headingTrail) ===
        JSON.stringify(table.headingTrail ?? []) &&
      block.rows.length === table.rows.length &&
      table.rows.every((row, rowIndex) => {
        const display = block.rows[rowIndex];
        return (
          display.sourceIndex === row.sourceIndex &&
          display.role === displayRole(row) &&
          display.text === row.text &&
          display.creditsText === (row.creditsText ?? null) &&
          JSON.stringify(display.linkedCourseCodes) ===
            JSON.stringify(row.linkedCourseCodes) &&
          JSON.stringify(display.sourceAnchors) ===
            JSON.stringify(row.sourceAnchors) &&
          JSON.stringify(display.footnoteMarkers) ===
            JSON.stringify(row.footnoteMarkers)
        );
      })
    );
  });
}

function hasSamplePlanFidelity(
  program: CatalogProgram,
  document: BulletinProgramDocument,
): boolean {
  if (JSON.stringify(program.samplePlan) !== JSON.stringify(document.samplePlan)) {
    return false;
  }
  const samplePlan = document.samplePlan;
  if (!samplePlan) return true;
  if (!BulletinSamplePlanSchema.safeParse(samplePlan).success) return false;
  if (
    new Set(samplePlan.terms.map((term) => term.sourceIndex)).size !==
    samplePlan.terms.length
  ) {
    return false;
  }
  if (
    samplePlan.importStatus === "eligible" &&
    (samplePlan.terms.length !== 8 ||
      !samplePlan.terms.every((term, index) => term.ordinal === index + 1))
  ) {
    return false;
  }
  return samplePlan.terms.every(
    (term) =>
      new Set(term.rows.map((row) => row.sourceIndex)).size === term.rows.length &&
      term.rows.every((row) =>
        row.kind === "course"
          ? row.linkedCourseCodes.length > 0
          : row.label.trim() !== "",
      ),
  );
}

function requirementValidationCodes(node: RequirementNode): Set<SnapshotValidationCode> {
  const codes = new Set<SnapshotValidationCode>();
  if (
    node.kind === "choose" &&
    (node.count < 1 || node.count > node.children.length)
  ) {
    codes.add("invalid-choose-cardinality");
  }
  if (node.kind === "manualConfirmation") {
    if (/^(?:select|choose|complete\s+one\s+of)\b/i.test(node.sourceText)) {
      codes.add("selector-manual-confirmation");
    }
    if (!/(?:advisor approval|placement|proficiency|petition)/i.test(node.sourceText)) {
      codes.add("unexpected-manual-condition");
    }
  }
  if (
    node.kind === "all" ||
    node.kind === "any" ||
    node.kind === "choose" ||
    node.kind === "credits"
  ) {
    node.children.forEach((child) =>
      requirementValidationCodes(child).forEach((code) => codes.add(code)),
    );
  } else if (node.kind === "exclusion") {
    requirementValidationCodes(node.child).forEach((code) => codes.add(code));
  }
  return codes;
}

function creditMinimums(node: RequirementNode): number[] {
  if (node.kind === "credits") {
    return [
      node.minimum,
      ...node.children.flatMap((child) => creditMinimums(child)),
    ];
  }
  if (
    node.kind === "all" ||
    node.kind === "any" ||
    node.kind === "choose"
  ) {
    return node.children.flatMap((child) => creditMinimums(child));
  }
  return node.kind === "exclusion" ? creditMinimums(node.child) : [];
}

function hasCreditDirectiveMismatch(
  interpretation: CatalogProgram["interpretations"][number],
  document: BulletinProgramDocument,
): boolean {
  if (!interpretation.requirement) return false;
  const tableById = new Map(
    document.requirementTables.map((table) => [table.id, table]),
  );
  const sourceMinimums = interpretation.sourceRowRefs.flatMap((reference) => {
    const text = tableById
      .get(reference.tableId)
      ?.rows.find((row) => row.sourceIndex === reference.sourceIndex)?.text;
    const match = text?.match(
      /^(?:complete|select|choose|take)\s+(\d+(?:\.\d+)?)\s+credits?\b/i,
    );
    return match ? [Number(match[1])] : [];
  });
  if (sourceMinimums.length === 0) return false;
  return (
    JSON.stringify(sourceMinimums.sort((left, right) => left - right)) !==
    JSON.stringify(
      creditMinimums(interpretation.requirement).sort((left, right) => left - right),
    )
  );
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
    const sourceDocument = matchingDocuments[0];
    if (!hasExactSourceRowCoverage(program, sourceDocument)) {
      coverageErrorUrls.add(program.provenance.sourceUrl);
    }
    if (!hasDisplayFidelity(program, sourceDocument)) {
      errors.push({
        code: "display-row-fidelity",
        sourceUrl: program.provenance.sourceUrl,
        entityId: program.id,
      });
    }
    if (!hasSamplePlanFidelity(program, sourceDocument)) {
      errors.push({
        code: "sample-plan-fidelity",
        sourceUrl: program.provenance.sourceUrl,
        entityId: program.id,
      });
    }

    const referenceKeys = program.interpretations.flatMap((interpretation) =>
      interpretation.sourceRowRefs.map(
        (reference) => `${reference.tableId}\u0000${reference.sourceIndex}`,
      ),
    );
    if (new Set(referenceKeys).size !== referenceKeys.length) {
      errors.push({
        code: "duplicate-source-reference",
        sourceUrl: program.provenance.sourceUrl,
        entityId: program.id,
      });
    }
    program.interpretations.forEach((interpretation) => {
      if (interpretation.status === "unavailable") {
        errors.push({
          code: "unavailable-interpretation",
          sourceUrl: program.provenance.sourceUrl,
          entityId: `${program.id}/${interpretation.id}`,
        });
      }
      if (interpretation.requirement) {
        requirementValidationCodes(interpretation.requirement).forEach((code) =>
          errors.push({
            code,
            sourceUrl: program.provenance.sourceUrl,
            entityId: `${program.id}/${interpretation.id}`,
          }),
        );
        if (hasCreditDirectiveMismatch(interpretation, sourceDocument)) {
          errors.push({
            code: "credit-mismatch",
            sourceUrl: program.provenance.sourceUrl,
            entityId: `${program.id}/${interpretation.id}`,
          });
        }
      }
    });
    program.categories.forEach((category) => {
      if (/^(?:course list|curriculum|requirements?)$/i.test(category.name.trim())) {
        errors.push({
          code: "generic-category-name",
          sourceUrl: program.provenance.sourceUrl,
          entityId: `${program.id}/${category.id}`,
        });
      }
      requirementValidationCodes(category.requirement).forEach((code) =>
        errors.push({
          code,
          sourceUrl: program.provenance.sourceUrl,
          entityId: `${program.id}/${category.id}`,
        }),
      );
    });
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
