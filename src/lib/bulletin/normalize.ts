import { createHash } from "node:crypto";
import type {
  BulletinSourceDocument,
  SourceCourse,
} from "@/lib/bulletin/parseCoursePage";
import type {
  BulletinProgramDocument,
  SourceTable,
  SourceTableRow,
} from "@/lib/bulletin/parseProgramPage";
import type { BulletinDiscovery } from "@/lib/bulletin/sourceTypes";
import { classifyCourseLevel } from "@/lib/bulletin/classifyCourse";
import { compileProgramRequirements } from "@/lib/bulletin/compileRequirements";
import { catalogCourseStableId, canonicalCourseCode } from "@/lib/catalog/identity";
import type {
  CatalogCourseRecord,
  SourceCatalogCandidate,
} from "@/lib/catalog/types";
import { CatalogCourseRecordSchema } from "@/lib/catalog/types";
import type {
  CatalogCandidate,
  CatalogCategory,
  CatalogProgram,
  CatalogRequirementInterpretation,
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

function parseCredits(course: SourceCourse): {
  credits: number;
  minCredits: number;
  maxCredits: number;
} {
  const rawCredits = (course.creditsText ?? course.creditText ?? undefined)?.trim();
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

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function parseCount(value: string): number | undefined {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) return numeric;
  return NUMBER_WORDS[value.toLowerCase()];
}

/**
 * Recognizes the Bulletin's "pick from a pool" instruction rows so pools become
 * choose/credits nodes instead of a wall of individually-required rows. NYU
 * writes these as `.courselistcomment` rows (role "comment"), occasionally as
 * area subheaders, and appends the pool's credit-hours total to the text:
 *   "Select one of the following: 4"                 → choose 1
 *   "Select two of the following: 8"                 → choose 2
 *   "Select five elective courses from the list below 20" → choose 5
 *   "Complete 8 credits from the following:"         → credits 8
 *   "Select 8 credits of the following"              → credits 8
 * A count with no verb ("Electives (Two Courses)") stays unrecognized on
 * purpose — it's a total, not a selection instruction.
 */
function explicitDirective(row: SourceTableRow): Directive | undefined {
  if (row.role !== "areaSubheader" && row.role !== "comment") return undefined;
  // Drop the trailing credit-hours total the Bulletin appends, then any
  // trailing punctuation: "Select two of the following: 8" → "Select two of the following".
  const text = row.text
    .trim()
    .replace(/\s+\d+(?:\.\d+)?\s*$/, "")
    .replace(/[.:]+$/, "")
    .trim();

  const creditPool = text.match(
    /^(?:complete|select|choose|take)\s+(\d+(?:\.\d+)?)\s+credits?\b/i,
  );
  if (creditPool) return { kind: "credits", minimum: Number(creditPool[1]) };

  if (/^select one$/i.test(text)) return { kind: "choose", count: 1 };
  // A choose-N pool: a count followed somewhere by a "from a set" phrasing.
  const choosePool = text.match(
    /^(?:select|choose|take)\s+(\w+)\b.*\b(?:following|from|of the|list|below|these|among|electives?)\b/i,
  );
  if (choosePool) {
    const count = parseCount(choosePool[1]);
    if (count !== undefined) return { kind: "choose", count };
  }
  return undefined;
}

export function isDirectiveRow(row: SourceTableRow): boolean {
  return explicitDirective(row) !== undefined;
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

interface NodeLocation {
  node: RequirementNode;
  path: number[];
}

function requirementLocations(
  node: RequirementNode,
  path: number[] = [],
): { containers: NodeLocation[]; leaves: NodeLocation[] } {
  if (
    node.kind === "all" ||
    node.kind === "any" ||
    node.kind === "choose" ||
    node.kind === "credits"
  ) {
    const descendants = node.children.map((child, index) =>
      requirementLocations(child, [...path, index]),
    );
    return {
      containers: [
        { node, path },
        ...descendants.flatMap((entry) => entry.containers),
      ],
      leaves: descendants.flatMap((entry) => entry.leaves),
    };
  }
  return { containers: [], leaves: [{ node, path }] };
}

function selectorLike(text: string): boolean {
  return /^(?:select|choose)\b|^complete\s+(?:\d+(?:\.\d+)?\s+credits?|one\s+of)\b/i.test(
    text,
  );
}

function appendInterpretationRows(
  sourceUrl: string,
  interpretation: CatalogRequirementInterpretation,
  tableById: ReadonlyMap<string, SourceTable>,
  requirementRows: CatalogRequirementRow[],
  sourceRows: CatalogSourceRow[],
): void {
  if (!interpretation.requirement) return;
  const locations = requirementLocations(interpretation.requirement);
  let containerIndex = 0;
  let leafIndex = 0;

  for (const reference of interpretation.sourceRowRefs) {
    const table = tableById.get(reference.tableId);
    const row = table?.rows.find(
      (candidate) => candidate.sourceIndex === reference.sourceIndex,
    );
    if (!row || row.role === "total") continue;
    if (row.role === "areaHeader") {
      sourceRows.push({
        representation: "categoryBoundary",
        sourceUrl,
        tableId: reference.tableId,
        sourceIndex: row.sourceIndex,
        sourceText: row.text,
        categoryId: interpretation.id,
      });
      continue;
    }

    const location = selectorLike(row.text)
      ? locations.containers[containerIndex++]
      : locations.leaves[leafIndex++];
    if (!location) continue;
    const entry = {
      sourceUrl,
      tableId: reference.tableId,
      sourceIndex: row.sourceIndex,
      sourceText: row.text,
      categoryId: interpretation.id,
      nodePath: location.path,
    };
    sourceRows.push({ representation: "requirementNode", ...entry });
    requirementRows.push({ ...entry, node: location.node });
  }
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
  const interpretations = compileProgramRequirements(document, courseTitles);
  const categories: CatalogCategory[] = interpretations.flatMap(
    (interpretation): CatalogCategory[] =>
      interpretation.status === "verified" && interpretation.requirement
        ? [
            {
              id: interpretation.id,
              name: interpretation.name,
              requirement: interpretation.requirement,
              sourceUrl: document.sourceUrl,
              sourceTableId: interpretation.sourceTableIds[0],
              sourceRowIndexes: interpretation.sourceRowRefs.map(
                (reference) => reference.sourceIndex,
              ),
            },
          ]
        : [],
  );
  const requirementRows: CatalogRequirementRow[] = [];
  const sourceRows: CatalogSourceRow[] = [];
  const sourceReferenceIds = new Set<string>();

  const tableById = new Map(
    document.requirementTables.map((table) => [table.id, table]),
  );
  for (const table of document.requirementTables) {
    for (const row of table.rows) {
      row.linkedCourseCodes.forEach((courseId) => sourceReferenceIds.add(courseId));
      const exclusion = explicitExclusion(row);
      if (exclusion?.kind === "exclusion") {
        exclusion.excludedCourseIds.forEach((courseId) =>
          sourceReferenceIds.add(courseId),
        );
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
      }
    }
  }

  for (const interpretation of interpretations) {
    if (interpretation.status !== "verified" || !interpretation.requirement) {
      continue;
    }
    appendInterpretationRows(
      document.sourceUrl,
      interpretation,
      tableById,
      requirementRows,
      sourceRows,
    );
  }
  const tableOrder = new Map(
    document.requirementTables.map((table, index) => [table.id, index]),
  );
  sourceRows.sort(
    (left, right) =>
      (tableOrder.get(left.tableId) ?? Number.MAX_SAFE_INTEGER) -
        (tableOrder.get(right.tableId) ?? Number.MAX_SAFE_INTEGER) ||
      left.sourceIndex - right.sourceIndex,
  );
  requirementRows.sort(
    (left, right) =>
      (tableOrder.get(left.tableId) ?? Number.MAX_SAFE_INTEGER) -
        (tableOrder.get(right.tableId) ?? Number.MAX_SAFE_INTEGER) ||
      left.sourceIndex - right.sourceIndex,
  );

  const type = document.kind === "core" ? "core" : discovered!.kind;

  return {
    id: programId,
    name: document.title,
    shortName: document.title,
    type,
    categories,
    bulletinDisplay: document.bulletinDisplay,
    interpretations,
    ...(document.samplePlan ? { samplePlan: document.samplePlan } : {}),
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
    auditAuthority: "nyush-bulletin",
    eligibleProfileRoles:
      type === "core"
        ? ["core"]
        : type === "minor"
          ? ["minor"]
          : ["primaryMajor", "secondMajor"],
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

function sourceCatalogRecord(
  discovery: BulletinDiscovery,
  document: BulletinSourceDocument,
  sourceCourse: SourceCourse,
  snapshotId: string,
): CatalogCourseRecord {
  if (sourceCourse.sourceId && sourceCourse.sourceId !== discovery.sourceId) {
    throw new BulletinNormalizationError(
      `Bulletin course ${sourceCourse.code} does not belong to ${discovery.sourceId}.`,
    );
  }
  const code = canonicalCourseCode(sourceCourse.code);
  const catalogOffering = parseOffering(sourceCourse.offeringText);
  const course = normalizeCourse(
    { ...sourceCourse, code },
    document,
    snapshotId,
  );
  const crossListTexts = sourceCourse.crossListTexts ?? [];
  course.sites = [discovery.source.campus === "new-york" ? "new-york" : "shanghai"];
  if (discovery.source.campus === "new-york") {
    course.offered = [];
    course.offeringKnown = false;
    course.fulfills = [];
  }
  course.attributes = [
    ...(course.attributes ?? []),
    ...crossListTexts.map((text) => `Cross-listed with ${text}`),
  ];

  return CatalogCourseRecordSchema.parse({
    stableId: catalogCourseStableId(discovery.sourceId, code),
    sourceId: discovery.sourceId,
    sourceSnapshotId: snapshotId,
    code,
    subject: code.split(/\s+/, 1)[0],
    level: "undergraduate",
    catalogOfferingTerms: catalogOffering.offered,
    catalogOfferingText: sourceCourse.offeringText ?? null,
    course,
    crossListedStableIds: crossListTexts.map((crossList) =>
      catalogCourseStableId(discovery.sourceId, crossList),
    ),
  });
}

export function normalizeBulletinSource(
  discovery: BulletinDiscovery,
  documents: readonly BulletinDocument[],
): SourceCatalogCandidate {
  const orderedDocuments = canonicalDocuments(documents);
  const sourceHashValue = candidateHash(orderedDocuments);
  const snapshotId = `${discovery.sourceId}-${sourceHashValue.slice(0, 24)}`;

  if (discovery.source.campus === "shanghai") {
    const legacy = normalizeBulletin(discovery, orderedDocuments);
    return {
      sourceId: discovery.sourceId,
      snapshotId,
      sourceHash: sourceHashValue,
      documents: orderedDocuments,
      courses: legacy.courses.map((course) =>
        CatalogCourseRecordSchema.parse({
          stableId: catalogCourseStableId(discovery.sourceId, course.id),
          sourceId: discovery.sourceId,
          sourceSnapshotId: snapshotId,
          code: canonicalCourseCode(course.id),
          subject: course.id.split(/\s+/, 1)[0],
          level: "undergraduate",
          catalogOfferingTerms: [...course.offered],
          catalogOfferingText: course.offeringText ?? null,
          course: {
            ...course,
            ...(course.provenance
              ? { provenance: { ...course.provenance, snapshotId } }
              : {}),
          },
          crossListedStableIds: [],
        }),
      ),
      programs: legacy.programs.map((program) => ({
        ...program,
        provenance: { ...program.provenance, snapshotId },
      })),
      quarantinedCourses: [],
      sourceReferenceIds: legacy.sourceReferenceIds,
      unresolvedCourseIds: legacy.unresolvedCourseIds,
    };
  }

  const subjectDocuments = orderedDocuments.filter(
    (document): document is BulletinSourceDocument => document.kind === "subject",
  );
  const courses: CatalogCourseRecord[] = [];
  const quarantinedCourses: SourceCatalogCandidate["quarantinedCourses"] = [];
  const references = new Set<string>();

  for (const document of subjectDocuments) {
    for (const sourceCourse of document.courses) {
      const decision = classifyCourseLevel(sourceCourse);
      sourceCourse.linkedCourseIds.forEach((id) => references.add(id));
      (sourceCourse.crossListTexts ?? []).forEach((id) => references.add(id));
      if (decision.level === "graduate") continue;
      if (decision.level === "ambiguous") {
        quarantinedCourses.push({
          code: sourceCourse.code,
          reason: decision.reason,
          sourceUrl: sourceCourse.sourceUrl ?? document.sourceUrl,
        });
        continue;
      }
      courses.push(
        sourceCatalogRecord(
          discovery,
          document,
          sourceCourse,
          snapshotId,
        ),
      );
    }
  }

  courses.sort((left, right) => left.stableId.localeCompare(right.stableId));
  quarantinedCourses.sort((left, right) => left.code.localeCompare(right.code));
  const localCodes = new Set(courses.map((record) => record.code));
  const sourceReferenceIds = [...references].sort((a, b) => a.localeCompare(b));
  return {
    sourceId: discovery.sourceId,
    snapshotId,
    sourceHash: sourceHashValue,
    documents: orderedDocuments,
    courses,
    programs: [],
    quarantinedCourses,
    sourceReferenceIds,
    unresolvedCourseIds: sourceReferenceIds.filter((id) => !localCodes.has(id)),
  };
}
