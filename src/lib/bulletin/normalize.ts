import { createHash } from "node:crypto";
import type {
  BulletinSourceDocument,
  SourceCourse,
} from "@/lib/bulletin/parseCoursePage";
import type {
  BulletinProgramDocument,
  SourceTableRow,
} from "@/lib/bulletin/parseProgramPage";
import type { BulletinDiscovery } from "@/lib/bulletin/sourceTypes";
import type {
  CatalogCandidate,
  CatalogCategory,
  CatalogProgram,
  CatalogRequirementRow,
  CatalogSourceRow,
  Course,
  RequirementNode,
  Term,
} from "@/lib/types";

export type BulletinDocument =
  | BulletinSourceDocument
  | BulletinProgramDocument;

export class BulletinNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BulletinNormalizationError";
  }
}

const COURSE_CODE =
  /\b[A-Z]{2,}(?:-[A-Z]{2,})+\s+\d{1,4}[A-Z]?(?:-[A-Z])?\b/g;

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sourceHash(document: BulletinDocument): string {
  return hash(document);
}

function compareDocuments(left: BulletinDocument, right: BulletinDocument): number {
  const byUrl = left.sourceUrl.localeCompare(right.sourceUrl);
  if (byUrl !== 0) return byUrl;
  const byKind = left.kind.localeCompare(right.kind);
  if (byKind !== 0) return byKind;
  return hash(left).localeCompare(hash(right));
}

function canonicalDocuments(
  documents: readonly BulletinDocument[],
): BulletinDocument[] {
  return [...documents].sort(compareDocuments);
}

function candidateHash(documents: readonly BulletinDocument[]): string {
  return hash(documents);
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

function parseCredits(course: SourceCourse): {
  credits: number;
  minCredits: number;
  maxCredits: number;
} {
  const rawCredits = course.creditsText?.trim();
  const credits = rawCredits?.match(/^\(([^()]*)\)$/)?.[1] ?? rawCredits;
  const match = credits?.match(
    /^(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*(?:credits?)?$/i,
  );
  if (!match) {
    throw new BulletinNormalizationError(
      `Bulletin course ${course.code} has no explicit fixed or variable credit value.`,
    );
  }

  const minimum = Number(match[1]);
  const maximum = Number(match[2] ?? match[1]);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) {
    throw new BulletinNormalizationError(
      `Bulletin course ${course.code} has an invalid credit range.`,
    );
  }
  return { credits: maximum, minCredits: minimum, maxCredits: maximum };
}

function parseOffering(offeringText: string | undefined): {
  offered: Term[];
  offeringKnown: boolean;
} {
  if (
    !offeringText ||
    /\b(?:occasionally|every\s+year)\b/i.test(offeringText)
  ) {
    return { offered: [], offeringKnown: false };
  }

  const offered: Term[] = [];
  if (/\bfall\b/i.test(offeringText)) offered.push("fall");
  if (/\bspring\b/i.test(offeringText)) offered.push("spring");
  return offered.length > 0
    ? { offered, offeringKnown: true }
    : { offered: [], offeringKnown: false };
}

function explicitPrerequisites(course: SourceCourse): string[][] {
  if (!course.prerequisiteText || course.linkedCourseIds.length === 0) return [];

  const body = course.prerequisiteText
    .replace(/^prerequisites?\s*(?:\(s\))?\s*:\s*/i, "")
    .trim();
  const matches = [...body.matchAll(COURSE_CODE)];
  const codes = matches.map((match) => match[0]);
  if (
    codes.length !== course.linkedCourseIds.length ||
    codes.some((code, index) => code !== course.linkedCourseIds[index])
  ) {
    return [];
  }

  const prefix = body.slice(0, matches[0].index).trim();
  const last = matches.at(-1)!;
  const suffix = body.slice((last.index ?? 0) + last[0].length);
  if (prefix !== "" || !/^[\s.;]*$/.test(suffix)) return [];

  const connectors: { kind: "and" | "or"; commaDelimited: boolean }[] = [];
  for (let index = 1; index < matches.length; index += 1) {
    const previous = matches[index - 1];
    const current = matches[index];
    const between = body.slice(
      (previous.index ?? 0) + previous[0].length,
      current.index,
    );
    const connector = between.match(/^\s*(,)?\s*(and|or)\s*$/i);
    if (!connector) return [];
    connectors.push({
      kind: connector[2].toLowerCase() as "and" | "or",
      commaDelimited: connector[1] === ",",
    });
  }

  const connectorKinds = new Set(connectors.map((connector) => connector.kind));
  if (
    connectorKinds.size > 1 &&
    connectors.some(
      (connector) => connector.kind === "and" && !connector.commaDelimited,
    )
  ) {
    return [];
  }

  const groups: string[][] = [[codes[0]]];
  connectors.forEach((connector, index) => {
    if (connector.kind === "or") groups.at(-1)!.push(codes[index + 1]);
    else groups.push([codes[index + 1]]);
  });
  return groups;
}

function normalizeCourse(
  course: SourceCourse,
  document: BulletinSourceDocument,
  snapshotId: string,
): Course {
  const credits = parseCredits(course);
  const offering = parseOffering(course.offeringText);
  return {
    id: course.code,
    title: course.title,
    ...credits,
    ...(course.creditsText ? { creditsText: course.creditsText } : {}),
    department: course.code.split(/\s+/, 1)[0],
    ...(course.description ? { description: course.description } : {}),
    prereqs: explicitPrerequisites(course),
    ...(course.prerequisiteText
      ? { prerequisiteText: course.prerequisiteText }
      : {}),
    sourceReferenceIds: [...new Set(course.linkedCourseIds)].sort((left, right) =>
      left.localeCompare(right),
    ),
    ...offering,
    ...(course.offeringText ? { offeringText: course.offeringText } : {}),
    sites: ["shanghai"],
    fulfills: [],
    equivalentTo: [],
    attributes: [...course.attributes],
    tags: [],
    provenance: {
      sourceUrl: document.sourceUrl,
      snapshotId,
      sourceHash: sourceHash(document),
    },
  };
}

type Directive =
  | { kind: "choose"; count: number }
  | { kind: "credits"; minimum: number };

function explicitDirective(row: SourceTableRow): Directive | undefined {
  if (row.role !== "areaSubheader") return undefined;
  if (/^select one:?$/i.test(row.text)) return { kind: "choose", count: 1 };
  const creditPool = row.text.match(
    /^complete (\d+(?:\.\d+)?) credits from:?$/i,
  );
  return creditPool
    ? { kind: "credits", minimum: Number(creditPool[1]) }
    : undefined;
}

function parseCourseCodeList(value: string): string[] | undefined {
  const matches = [...value.matchAll(COURSE_CODE)];
  if (matches.length === 0 || value.slice(0, matches[0].index).trim() !== "") {
    return undefined;
  }
  for (let index = 1; index < matches.length; index += 1) {
    const previous = matches[index - 1];
    const current = matches[index];
    const separator = value.slice(
      (previous.index ?? 0) + previous[0].length,
      current.index,
    );
    if (!/^\s*(?:,|,?\s+and)\s*$/i.test(separator)) return undefined;
  }
  const last = matches.at(-1)!;
  if (!/^[\s.]*$/.test(value.slice((last.index ?? 0) + last[0].length))) {
    return undefined;
  }
  return matches.map((match) => match[0]);
}

function explicitExclusion(row: SourceTableRow): RequirementNode | undefined {
  const match = row.text.match(
    /^courses with the "([^"]+)" attribute, excluding (.+)$/i,
  );
  if (!match) return undefined;
  const listedCodes = parseCourseCodeList(match[2]);
  if (!listedCodes) return undefined;
  return {
    kind: "exclusion",
    excludedCourseIds: listedCodes,
    child: { kind: "attribute", attribute: match[1] },
  };
}

function removeTrailingLiteral(value: string, literal: string): string | undefined {
  if (!value.endsWith(literal)) return undefined;
  return value.slice(0, -literal.length).trimEnd();
}

function isPureCourseReference(
  row: SourceTableRow,
  courseTitles: ReadonlyMap<string, string>,
): boolean {
  if (row.role !== "course" || row.linkedCourseCodes.length !== 1) return false;
  const courseId = row.linkedCourseCodes[0];
  if (row.text !== courseId && !row.text.startsWith(`${courseId} `)) return false;

  let displayText = row.text.slice(courseId.length).trim();
  if (row.creditsText) {
    const withoutCredits = removeTrailingLiteral(displayText, row.creditsText);
    if (withoutCredits !== undefined) displayText = withoutCredits;
  }
  for (const marker of [...row.footnoteMarkers].reverse()) {
    const withoutMarker = removeTrailingLiteral(displayText, marker);
    if (withoutMarker !== undefined) displayText = withoutMarker;
  }
  if (displayText === "") {
    return courseTitles.has(courseId) || isExternalNyuCourseId(courseId);
  }
  const knownTitle = courseTitles.get(courseId);
  return knownTitle !== undefined && displayText === knownTitle;
}

function explicitRowNode(
  row: SourceTableRow,
  programId: string,
  categoryId: string,
  categoryName: string,
  courseTitles: ReadonlyMap<string, string>,
): RequirementNode {
  if (isPureCourseReference(row, courseTitles)) {
    return { kind: "course", courseId: row.linkedCourseCodes[0] };
  }

  const exclusion = explicitExclusion(row);
  if (exclusion) return exclusion;

  const attribute = row.text.match(
    /^courses with the "([^"]+)" attribute\.?$/i,
  );
  if (attribute) return { kind: "attribute", attribute: attribute[1] };

  const waiver = row.text.match(/^(.+?) may waive this requirement\.?$/i);
  if (waiver) {
    return {
      kind: "waiver",
      waiverId: `${programId}-${categoryId}-${row.sourceIndex}`,
      label: waiver[1],
    };
  }

  return {
    kind: "manualConfirmation",
    label: categoryName,
    sourceText: row.text,
  };
}

function manualRowNode(
  row: SourceTableRow,
  categoryName: string,
): RequirementNode {
  return {
    kind: "manualConfirmation",
    label: categoryName,
    sourceText: row.text,
  };
}

interface RowGroup {
  header?: SourceTableRow;
  rows: SourceTableRow[];
}

function tableGroups(rows: SourceTableRow[]): RowGroup[] {
  const groups: RowGroup[] = [];
  let current: RowGroup | undefined;
  for (const row of rows) {
    if (row.role === "areaHeader") {
      current = { header: row, rows: [row] };
      groups.push(current);
      continue;
    }
    if (!current) {
      current = { rows: [] };
      groups.push(current);
    }
    current.rows.push(row);
  }
  return groups;
}

function uniqueCategoryId(name: string, used: Map<string, number>): string {
  const base = slug(name);
  const sequence = (used.get(base) ?? 0) + 1;
  used.set(base, sequence);
  return sequence === 1 ? base : `${base}-${sequence}`;
}

function combineNodes(nodes: RequirementNode[]): RequirementNode {
  return nodes.length === 1 ? nodes[0] : { kind: "all", children: nodes };
}

function semanticRowGroups(rows: SourceTableRow[]): SourceTableRow[][] {
  const groups: SourceTableRow[][] = [];
  for (const row of rows) {
    if (row.role === "areaSubheader" || groups.length === 0) groups.push([]);
    groups.at(-1)!.push(row);
  }
  return groups;
}

interface NormalizedSemanticGroup {
  requirement: RequirementNode;
  rowNodes: Map<number, RequirementNode>;
  rowPaths: Map<number, number[]>;
}

function normalizeSemanticGroup(
  rows: SourceTableRow[],
  programId: string,
  categoryId: string,
  categoryName: string,
  courseTitles: ReadonlyMap<string, string>,
): NormalizedSemanticGroup {
  const directive = explicitDirective(rows[0]);
  const unsupportedSelector =
    !directive &&
    rows[0].role === "areaSubheader" &&
    /^(?:select|choose|complete)\b/i.test(rows[0].text);
  const rowNodes = new Map<number, RequirementNode>();
  const rowPaths = new Map<number, number[]>();

  if (directive && rows.length > 1) {
    const children = rows
      .slice(1)
      .map((row) =>
        explicitRowNode(
          row,
          programId,
          categoryId,
          categoryName,
          courseTitles,
        ),
      );
    const requirement: RequirementNode =
      directive.kind === "choose"
        ? { kind: "choose", count: directive.count, children }
        : { kind: "credits", minimum: directive.minimum, children };
    rowNodes.set(rows[0].sourceIndex, requirement);
    rowPaths.set(rows[0].sourceIndex, []);
    rows.slice(1).forEach((row, index) => {
      rowNodes.set(row.sourceIndex, children[index]);
      rowPaths.set(row.sourceIndex, [index]);
    });
    return { requirement, rowNodes, rowPaths };
  }

  const nodes = rows.map((row) =>
    unsupportedSelector
      ? manualRowNode(row, categoryName)
      : explicitRowNode(
          row,
          programId,
          categoryId,
          categoryName,
          courseTitles,
        ),
  );
  const requirement = combineNodes(nodes);
  rows.forEach((row, index) => {
    rowNodes.set(row.sourceIndex, nodes[index]);
    rowPaths.set(row.sourceIndex, nodes.length === 1 ? [] : [index]);
  });
  return { requirement, rowNodes, rowPaths };
}

function normalizeProgram(
  document: BulletinProgramDocument,
  discovery: BulletinDiscovery,
  snapshotId: string,
  courseTitles: ReadonlyMap<string, string>,
): CatalogProgram {
  const discovered = [...discovery.majors, ...discovery.minors].find(
    (source) => source.slug === document.slug && source.url === document.sourceUrl,
  );
  if (document.kind === "program" && !discovered) {
    throw new BulletinNormalizationError(
      `Program document ${document.sourceUrl} was not present in discovery.`,
    );
  }

  const programId = document.kind === "core" ? "core" : document.slug;
  const categories: CatalogCategory[] = [];
  const requirementRows: CatalogRequirementRow[] = [];
  const sourceRows: CatalogSourceRow[] = [];
  const sourceReferenceIds = new Set<string>();
  const usedCategoryIds = new Map<string, number>();

  for (const table of document.requirementTables) {
    for (const group of tableGroups(table.rows)) {
      const categoryName = group.header?.text ?? table.caption ?? table.id;
      const categoryId = uniqueCategoryId(categoryName, usedCategoryIds);
      const semanticRows = group.rows.filter(
        (row) => row.role !== "areaHeader" && row.role !== "total",
      );

      const rowNodes = new Map<number, RequirementNode>();
      const rowPaths = new Map<number, number[]>();
      let requirement: RequirementNode | undefined;

      if (semanticRows.length > 0) {
        const normalizedGroups = semanticRowGroups(semanticRows).map((rows) =>
          normalizeSemanticGroup(
            rows,
            programId,
            categoryId,
            categoryName,
            courseTitles,
          ),
        );
        requirement = combineNodes(
          normalizedGroups.map((normalized) => normalized.requirement),
        );
        normalizedGroups.forEach((normalized, groupIndex) => {
          normalized.rowNodes.forEach((node, sourceIndex) => {
            rowNodes.set(sourceIndex, node);
            const localPath = normalized.rowPaths.get(sourceIndex)!;
            rowPaths.set(
              sourceIndex,
              normalizedGroups.length === 1
                ? localPath
                : [groupIndex, ...localPath],
            );
          });
        });
      }

      if (requirement) {
        categories.push({
          id: categoryId,
          name: categoryName,
          requirement,
          sourceUrl: document.sourceUrl,
          sourceTableId: table.id,
          sourceRowIndexes: group.rows.map((row) => row.sourceIndex),
        });
      }

      for (const row of group.rows) {
        row.linkedCourseCodes.forEach((courseId) =>
          sourceReferenceIds.add(courseId),
        );
        const exclusion = explicitExclusion(row);
        if (exclusion?.kind === "exclusion") {
          exclusion.excludedCourseIds.forEach((courseId) =>
            sourceReferenceIds.add(courseId),
          );
        }
        if (row.role === "areaHeader") {
          sourceRows.push({
            representation: "categoryBoundary",
            sourceUrl: document.sourceUrl,
            tableId: table.id,
            sourceIndex: row.sourceIndex,
            sourceText: row.text,
            categoryId,
          });
          continue;
        }
        if (row.role === "total") {
          sourceRows.push({
            representation: "publishedTotal",
            sourceUrl: document.sourceUrl,
            tableId: table.id,
            sourceIndex: row.sourceIndex,
            sourceText: row.text,
            ...(row.creditsText ? { creditsText: row.creditsText } : {}),
          });
          continue;
        }

        const node = rowNodes.get(row.sourceIndex);
        const nodePath = rowPaths.get(row.sourceIndex);
        if (!node || !nodePath) {
          throw new BulletinNormalizationError(
            `Requirement row ${table.id}:${row.sourceIndex} was not represented.`,
          );
        }
        const entry = {
          sourceUrl: document.sourceUrl,
          tableId: table.id,
          sourceIndex: row.sourceIndex,
          sourceText: row.text,
          categoryId,
          nodePath,
        };
        sourceRows.push({ representation: "requirementNode", ...entry });
        requirementRows.push({ ...entry, node });
      }
    }
  }

  return {
    id: programId,
    name: document.title,
    shortName: document.title,
    type: document.kind === "core" ? "core" : discovered!.kind,
    categories,
    requirementRows,
    sourceRows,
    sourceReferenceIds: [...sourceReferenceIds].sort((left, right) =>
      left.localeCompare(right),
    ),
    provenance: {
      sourceUrl: document.sourceUrl,
      snapshotId,
      sourceHash: sourceHash(document),
    },
  };
}

function courseMatchesNode(course: Course, node: RequirementNode): boolean {
  switch (node.kind) {
    case "course":
      return course.id === node.courseId;
    case "attribute":
      return (course.attributes ?? []).includes(node.attribute);
    case "exclusion":
      return (
        !node.excludedCourseIds.includes(course.id) &&
        courseMatchesNode(course, node.child)
      );
    case "all":
    case "any":
    case "choose":
    case "credits":
      return node.children.some((child) => courseMatchesNode(course, child));
    case "waiver":
    case "manualConfirmation":
      return false;
  }
}

function isExternalNyuCourseId(courseId: string): boolean {
  return !courseId.split(/\s+/, 1)[0].endsWith("-SHU");
}

export function normalizeBulletin(
  discovery: BulletinDiscovery,
  documents: readonly BulletinDocument[],
): CatalogCandidate {
  const orderedDocuments = canonicalDocuments(documents);
  const sourceHashValue = candidateHash(orderedDocuments);
  const snapshotId = `bulletin-${sourceHashValue.slice(0, 24)}`;
  const courses = orderedDocuments
    .filter((document): document is BulletinSourceDocument =>
      document.kind === "subject",
    )
    .flatMap((document) =>
      document.courses.map((course) =>
        normalizeCourse(course, document, snapshotId),
      ),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const courseTitles = new Map(
    courses.map((course) => [course.id, course.title] as const),
  );
  const programs = orderedDocuments
    .filter((document): document is BulletinProgramDocument =>
      document.kind === "program" || document.kind === "core",
    )
    .map((document) =>
      normalizeProgram(document, discovery, snapshotId, courseTitles),
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const course of courses) {
    course.fulfills = programs
      .flatMap((program) =>
        program.categories
          .filter((category) => courseMatchesNode(course, category.requirement))
          .map((category) => ({
            programId: program.id,
            categoryId: category.id,
          })),
      )
      .sort((left, right) =>
        `${left.programId}/${left.categoryId}`.localeCompare(
          `${right.programId}/${right.categoryId}`,
        ),
      );
  }

  const localCourseIds = new Set(courses.map((course) => course.id));
  const sourceReferenceIds = new Set<string>();
  programs.forEach((program) =>
    program.sourceReferenceIds.forEach((courseId) =>
      sourceReferenceIds.add(courseId),
    ),
  );
  courses.forEach((course) =>
    (course.sourceReferenceIds ?? []).forEach((courseId) =>
      sourceReferenceIds.add(courseId),
    ),
  );
  const sortedSourceReferenceIds = [...sourceReferenceIds].sort((left, right) =>
    left.localeCompare(right),
  );

  return {
    snapshotId,
    sourceHash: sourceHashValue,
    documents: orderedDocuments,
    courses,
    programs,
    sourceReferenceIds: sortedSourceReferenceIds,
    externalCourseIds: sortedSourceReferenceIds
      .filter((id) => !localCourseIds.has(id) && isExternalNyuCourseId(id))
      .sort((left, right) => left.localeCompare(right)),
    unresolvedCourseIds: sortedSourceReferenceIds
      .filter((id) => !localCourseIds.has(id) && !isExternalNyuCourseId(id))
      .sort((left, right) => left.localeCompare(right)),
  };
}
