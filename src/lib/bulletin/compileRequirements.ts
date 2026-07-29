import type {
  CatalogRequirementInterpretation,
  RequirementNode,
} from "@/lib/types";
import type {
  BulletinProgramDocument,
  SourceTable,
  SourceTableRow,
} from "@/lib/bulletin/parseProgramPage";

const COUNT_WORDS = new Map([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
]);

const CHOOSE_DIRECTIVE =
  /^(?:select|choose)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i;
const CONCENTRATION_DIRECTIVE =
  /^complete\s+one\s+of\s+the\s+following\s+concentrations?:?/i;
const CREDIT_DIRECTIVE =
  /^(?:complete|select|choose|take)\s+(\d+(?:\.\d+)?)\s+credits?\b/i;
const COURSE_CODE = /\b[A-Z]{2,}(?:-[A-Z]{2,})+\s+\d{1,4}[A-Z]?(?:-[A-Z])?\b/g;
const GENERIC_NAMES = new Set(["course list", "curriculum", "requirements"]);

interface RowGroup {
  header?: SourceTableRow;
  rows: SourceTableRow[];
}

interface CompileResult {
  requirement: RequirementNode | null;
  diagnostics: CatalogRequirementInterpretation["diagnostics"];
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "requirement"
  );
}

function uniqueId(name: string, used: Map<string, number>): string {
  const base = slug(name);
  const sequence = (used.get(base) ?? 0) + 1;
  used.set(base, sequence);
  return sequence === 1 ? base : `${base}-${sequence}`;
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
  return groups.length > 0 ? groups : [{ rows: [] }];
}

function meaningfulTableName(table: SourceTable): string {
  const candidates = [
    ...(table.headingTrail ?? []).map((heading) => heading.text).reverse(),
    table.caption,
  ];
  return (
    candidates.find(
      (candidate): candidate is string =>
        Boolean(candidate) && !GENERIC_NAMES.has(candidate!.trim().toLowerCase()),
    ) ??
    table.caption ??
    table.id
  );
}

function groupName(table: SourceTable, group: RowGroup): string {
  return group.header?.text ?? meaningfulTableName(table);
}

function directiveCount(text: string): number | null {
  if (CONCENTRATION_DIRECTIVE.test(text)) return 1;
  const token = text.match(CHOOSE_DIRECTIVE)?.[1]?.toLowerCase();
  if (!token) return null;
  return COUNT_WORDS.get(token) ?? Number(token);
}

function removeTrailingLiteral(value: string, literal: string): string | null {
  if (!value.endsWith(literal)) return null;
  return value.slice(0, -literal.length).trimEnd();
}

function isExternalNyuCourseId(courseId: string): boolean {
  return !courseId.split(/\s+/, 1)[0].endsWith("-SHU");
}

function courseNode(
  row: SourceTableRow,
  courseTitles: ReadonlyMap<string, string>,
): RequirementNode | null {
  if (row.role !== "course" || row.linkedCourseCodes.length !== 1) return null;
  const courseId = row.linkedCourseCodes[0];
  if (row.text !== courseId && !row.text.startsWith(`${courseId} `)) return null;

  let displayText = row.text.slice(courseId.length).trim();
  if (row.creditsText) {
    displayText = removeTrailingLiteral(displayText, row.creditsText) ?? displayText;
  }
  for (const marker of [...row.footnoteMarkers].reverse()) {
    displayText = removeTrailingLiteral(displayText, marker) ?? displayText;
  }
  const knownTitle = courseTitles.get(courseId);
  if (
    displayText !== "" &&
    !(knownTitle !== undefined && displayText === knownTitle)
  ) {
    return null;
  }
  if (displayText === "" && !knownTitle && !isExternalNyuCourseId(courseId)) {
    return null;
  }
  return { kind: "course", courseId };
}

function parseCourseCodeList(value: string): string[] | null {
  const matches = [...value.matchAll(COURSE_CODE)];
  if (matches.length === 0 || value.slice(0, matches[0].index).trim() !== "") {
    return null;
  }
  for (let index = 1; index < matches.length; index += 1) {
    const previous = matches[index - 1];
    const current = matches[index];
    const separator = value.slice(
      (previous.index ?? 0) + previous[0].length,
      current.index,
    );
    if (!/^\s*(?:,|,?\s+and)\s*$/i.test(separator)) return null;
  }
  const last = matches.at(-1)!;
  if (!/^[\s.]*$/.test(value.slice((last.index ?? 0) + last[0].length))) {
    return null;
  }
  return matches.map((match) => match[0]);
}

function explicitNode(
  row: SourceTableRow,
  programId: string,
  interpretationId: string,
  name: string,
  courseTitles: ReadonlyMap<string, string>,
): RequirementNode | null {
  const course = courseNode(row, courseTitles);
  if (course) return course;

  const exclusion = row.text.match(
    /^courses with the "([^"]+)" attribute, excluding (.+)$/i,
  );
  if (exclusion) {
    const excludedCourseIds = parseCourseCodeList(exclusion[2]);
    if (excludedCourseIds) {
      return {
        kind: "exclusion",
        excludedCourseIds,
        child: { kind: "attribute", attribute: exclusion[1] },
      };
    }
  }

  const attribute = row.text.match(
    /^courses with the "([^"]+)" attribute\.?$/i,
  );
  if (attribute) return { kind: "attribute", attribute: attribute[1] };

  const waiver = row.text.match(/^(.+?) may waive this requirement\.?$/i);
  if (waiver && /(?:placement|proficiency|petition|advisor)/i.test(waiver[1])) {
    return {
      kind: "waiver",
      waiverId: `${programId}-${interpretationId}-${row.sourceIndex}`,
      label: waiver[1],
    };
  }

  if (/(?:advisor approval|placement|proficiency|petition)/i.test(row.text)) {
    return {
      kind: "manualConfirmation",
      label: name,
      sourceText: row.text,
    };
  }
  return null;
}

function combine(nodes: RequirementNode[]): RequirementNode {
  return nodes.length === 1 ? nodes[0] : { kind: "all", children: nodes };
}

function unavailable(
  code: string,
  message: string,
  tableId: string,
  sourceIndex?: number,
): CompileResult {
  return {
    requirement: null,
    diagnostics: [{ code, message, tableId, ...(sourceIndex === undefined ? {} : { sourceIndex }) }],
  };
}

function compileRows(
  rows: SourceTableRow[],
  tableId: string,
  programId: string,
  interpretationId: string,
  name: string,
  courseTitles: ReadonlyMap<string, string>,
): CompileResult {
  const executableRows = rows.filter(
    (row) => row.role !== "areaHeader" && row.role !== "total",
  );
  if (executableRows.length === 0) {
    return unavailable(
      "no-executable-rows",
      "This source group contains only structural or total rows.",
      tableId,
    );
  }

  const segments: SourceTableRow[][] = [];
  for (const row of executableRows) {
    const startsDirective =
      directiveCount(row.text) !== null || CREDIT_DIRECTIVE.test(row.text);
    const previous = segments.at(-1);
    if (
      startsDirective &&
      previous?.length === 1 &&
      previous[0].role === "areaSubheader" &&
      directiveCount(previous[0].text) === null
    ) {
      previous[0] = row;
      continue;
    }
    if (segments.length === 0 || startsDirective || row.role === "areaSubheader") {
      segments.push([]);
    }
    segments.at(-1)!.push(row);
  }

  const compiled: RequirementNode[] = [];
  for (const segment of segments) {
    const first = segment[0];
    const count = directiveCount(first.text);
    const creditMinimum = Number(first.text.match(CREDIT_DIRECTIVE)?.[1]);
    const hasDirective = count !== null || Number.isFinite(creditMinimum);
    const structuralHeading = first.role === "areaSubheader" && !hasDirective;
    const childRows = hasDirective || structuralHeading ? segment.slice(1) : segment;
    if (structuralHeading && childRows.length === 0) {
      return unavailable(
        "heading-without-rows",
        `Structural heading has no requirement rows: ${first.text}`,
        tableId,
        first.sourceIndex,
      );
    }
    const children: RequirementNode[] = [];
    for (const row of childRows) {
      const node = explicitNode(
        row,
        programId,
        interpretationId,
        name,
        courseTitles,
      );
      if (!node) {
        return unavailable(
          "unsupported-requirement-row",
          `Unsupported requirement row: ${row.text}`,
          tableId,
          row.sourceIndex,
        );
      }
      children.push(node);
    }

    if (hasDirective) {
      if (children.length === 0) {
        return unavailable(
          "selector-without-children",
          `Selector has no eligible children: ${first.text}`,
          tableId,
          first.sourceIndex,
        );
      }
      if (count !== null) {
        if (count < 1 || count > children.length) {
          return unavailable(
            "invalid-selector-cardinality",
            `Selector requests ${count} of ${children.length} eligible children.`,
            tableId,
            first.sourceIndex,
          );
        }
        compiled.push({ kind: "choose", count, children });
      } else {
        compiled.push({ kind: "credits", minimum: creditMinimum, children });
      }
    } else {
      compiled.push(combine(children));
    }
  }

  return { requirement: combine(compiled), diagnostics: [] };
}

function refs(tables: readonly SourceTable[]) {
  return tables.flatMap((table) =>
    table.rows.map((row) => ({ tableId: table.id, sourceIndex: row.sourceIndex })),
  );
}

function interpretation(
  id: string,
  name: string,
  tables: readonly SourceTable[],
  result: CompileResult,
  sourceRowRefs = refs(tables),
): CatalogRequirementInterpretation {
  return {
    id,
    name,
    status: result.requirement ? "verified" : "unavailable",
    requirement: result.requirement,
    sourceTableIds: tables.map((table) => table.id),
    sourceRowRefs,
    diagnostics: result.diagnostics,
  };
}

function concentrationTables(
  tables: readonly SourceTable[],
  selectorIndex: number,
): SourceTable[] {
  const selector = tables[selectorIndex];
  const candidates: SourceTable[] = [];
  for (const table of tables.slice(selectorIndex + 1)) {
    if (table.sectionId !== selector.sectionId) break;
    if ((table.headingTrail ?? []).length === 0) break;
    candidates.push(table);
  }
  return candidates;
}

function namedTableSelector(
  tables: readonly SourceTable[],
  tableIndex: number,
  table: SourceTable,
): { table: SourceTable; row: SourceTableRow; count: number } | null {
  const target = meaningfulTableName(table).trim().toLowerCase();
  for (let index = tableIndex - 1; index >= 0; index -= 1) {
    const candidate = tables[index];
    if (candidate.sectionId !== table.sectionId) break;
    for (let rowIndex = 0; rowIndex < candidate.rows.length - 1; rowIndex += 1) {
      const heading = candidate.rows[rowIndex];
      const directive = candidate.rows[rowIndex + 1];
      const count = directiveCount(directive.text);
      if (
        heading.role === "areaSubheader" &&
        heading.text.trim().toLowerCase() === target &&
        count !== null
      ) {
        return { table: candidate, row: directive, count };
      }
    }
  }
  return null;
}

function coreTableCardinality(table: SourceTable): number | null {
  const name = meaningfulTableName(table);
  if (/Interdisciplinary Perspectives on China Courses/i.test(name)) return 2;
  if (/Mathematics Courses/i.test(name)) return 1;
  if (/Experimental Discovery in the Natural World/i.test(name)) return 1;
  if (/Science, Technology, and Society Courses/i.test(name)) return 1;
  if (/Algorithmic Thinking Courses/i.test(name)) return 1;
  return null;
}

export function compileProgramRequirements(
  document: BulletinProgramDocument,
  courseTitles: ReadonlyMap<string, string>,
): CatalogRequirementInterpretation[] {
  const programId = document.kind === "core" ? "core" : document.slug;
  const interpretations: CatalogRequirementInterpretation[] = [];
  const consumedTables = new Set<string>();
  const usedIds = new Map<string, number>();

  document.requirementTables.forEach((table, tableIndex) => {
    if (consumedTables.has(table.id)) return;
    for (const group of tableGroups(table.rows)) {
      const name = groupName(table, group);
      const id = uniqueId(name, usedIds);
      const concentrationSelector = group.rows.find((row) =>
        CONCENTRATION_DIRECTIVE.test(row.text),
      );

      if (concentrationSelector) {
        const namedTables = concentrationTables(
          document.requirementTables,
          tableIndex,
        );
        const children: RequirementNode[] = [];
        const diagnostics: CatalogRequirementInterpretation["diagnostics"] = [];
        const selectorIndex = group.rows.indexOf(concentrationSelector);
        const preceding = group.rows[selectorIndex - 1];
        const baseRows = group.rows.slice(
          0,
          preceding?.role === "areaSubheader" &&
            directiveCount(preceding.text) === null
            ? selectorIndex - 1
            : selectorIndex,
        );
        const hasBaseRows = baseRows.some(
          (row) => row.role !== "areaHeader" && row.role !== "total",
        );
        const base = hasBaseRows
          ? compileRows(
              baseRows,
              table.id,
              programId,
              id,
              name,
              courseTitles,
            )
          : { requirement: null, diagnostics: [] };
        if (hasBaseRows && !base.requirement) {
          diagnostics.push(...base.diagnostics);
        }
        for (const namedTable of namedTables) {
          const result = compileRows(
            namedTable.rows,
            namedTable.id,
            programId,
            id,
            meaningfulTableName(namedTable),
            courseTitles,
          );
          if (!result.requirement) diagnostics.push(...result.diagnostics);
          else {
            children.push(
              result.requirement.kind === "all"
                ? result.requirement
                : { kind: "all", children: [result.requirement] },
            );
          }
        }

        const allTables = [table, ...namedTables];
        namedTables.forEach((namedTable) => consumedTables.add(namedTable.id));
        if (namedTables.length === 0 || diagnostics.length > 0) {
          interpretations.push(
            interpretation(id, name, allTables, {
              requirement: null,
              diagnostics:
                diagnostics.length > 0
                  ? diagnostics
                  : [
                      {
                        code: "unresolved-concentrations",
                        message: "The concentration selector did not resolve to named tables.",
                        tableId: table.id,
                        sourceIndex: concentrationSelector.sourceIndex,
                      },
                    ],
            }, [
              ...group.rows.map((row) => ({
                tableId: table.id,
                sourceIndex: row.sourceIndex,
              })),
              ...refs(namedTables),
            ]),
          );
        } else {
          const concentration: RequirementNode = {
            kind: "choose",
            count: 1,
            children,
          };
          interpretations.push(
            interpretation(id, name, allTables, {
              requirement: base.requirement
                ? combine([base.requirement, concentration])
                : concentration,
              diagnostics: [],
            }, [
              ...group.rows.map((row) => ({
                tableId: table.id,
                sourceIndex: row.sourceIndex,
              })),
              ...refs(namedTables),
            ]),
          );
        }
        continue;
      }

      const selector = namedTableSelector(
        document.requirementTables,
        tableIndex,
        table,
      );
      const compiled = compileRows(
        group.rows,
        table.id,
        programId,
        id,
        name,
        courseTitles,
      );
      const selectorChildren =
        compiled.requirement?.kind === "all"
          ? compiled.requirement.children
          : compiled.requirement
            ? [compiled.requirement]
            : [];
      let result: CompileResult =
        selector && compiled.requirement
          ? selector.count >= 1 && selector.count <= selectorChildren.length
            ? {
                requirement: {
                  kind: "choose" as const,
                  count: selector.count,
                  children: selectorChildren,
                },
                diagnostics: [],
              }
            : unavailable(
                "invalid-selector-cardinality",
                `Selector requests ${selector.count} of ${selectorChildren.length} eligible children.`,
                selector.table.id,
                selector.row.sourceIndex,
              )
          : compiled;
      if (document.kind === "core") {
        const count = coreTableCardinality(table);
        if (count === null) {
          result = unavailable(
            "unresolved-core-cardinality",
            `The Core prose does not define one safe course-list cardinality for ${name}.`,
            table.id,
          );
        } else if (compiled.requirement) {
          if (count > selectorChildren.length) {
            result = unavailable(
              "invalid-selector-cardinality",
              `Core requirement requests ${count} of ${selectorChildren.length} eligible children.`,
              table.id,
            );
          } else {
            result = {
              requirement: { kind: "choose", count, children: selectorChildren },
              diagnostics: [],
            };
          }
        }
      }
      interpretations.push(
        interpretation(
          id,
          name,
          selector ? [selector.table, table] : [table],
          result,
          [
            ...(selector
              ? [{ tableId: selector.table.id, sourceIndex: selector.row.sourceIndex }]
              : []),
            ...group.rows.map((row) => ({
              tableId: table.id,
              sourceIndex: row.sourceIndex,
            })),
          ],
        ),
      );
    }
  });

  return interpretations;
}
