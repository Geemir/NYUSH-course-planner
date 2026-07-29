import * as cheerio from "cheerio";
import type { BulletinProgramKind } from "@/lib/bulletin/sourceTypes";
import type {
  BulletinDisplayRow,
  BulletinRequirementDocument,
  BulletinSamplePlan,
  BulletinSamplePlanRow,
  BulletinSamplePlanTerm,
} from "@/lib/bulletin/displayTypes";

export type BulletinProgramPageSource =
  | {
      kind: BulletinProgramKind;
      slug: string;
      title: string;
      url: string;
    }
  | {
      kind: "core";
      slug: "core-curriculum";
      title: string;
      url: string;
    };

export type SourceTableRowRole =
  | "areaHeader"
  | "areaSubheader"
  | "course"
  | "comment"
  | "total";

export interface SourceTableRow {
  role: SourceTableRowRole;
  sourceIndex: number;
  text: string;
  creditsText?: string;
  linkedCourseCodes: string[];
  sourceAnchors: string[];
  footnoteMarkers: string[];
}

export interface SourceTable {
  id: string;
  sectionId: string;
  caption?: string;
  headingTrail?: Array<{ level: 2 | 3 | 4 | 5 | 6; text: string }>;
  rows: SourceTableRow[];
}

export interface SourceSection {
  id: string;
  heading: string;
  text: string;
  prose: string[];
  tableIds: string[];
}

export interface SourcePolicy {
  id: string;
  heading: string;
  text: string;
}

export interface SourceFootnote {
  id: string;
  marker: string;
  text: string;
}

export interface BulletinProgramDocument {
  kind: "program" | "core";
  slug: string;
  title: string;
  sourceUrl: string;
  bulletinDisplay: BulletinRequirementDocument;
  sections: SourceSection[];
  requirementTables: SourceTable[];
  policies: SourcePolicy[];
  footnotes: SourceFootnote[];
  samplePlan?: BulletinSamplePlan;
}

export class BulletinProgramParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BulletinProgramParseError";
  }
}

const SHANGHAI_PATH = "/undergraduate/shanghai/";
const PROGRAM_PATH = `${SHANGHAI_PATH}programs/`;
const CORE_PATH = `${SHANGHAI_PATH}core-curriculum/`;
const COURSE_CODE =
  /\b[A-Z]{2,}(?:-[A-Z]{2,})+\s+\d{1,4}[A-Z]?(?:-[A-Z])?\b/g;
const REQUIREMENT_TABLE_SELECTOR = "table.sc_courselist, table.sc_plangrid";
const SOURCE_CONTAINER_SELECTOR = "main section[id], main [id$='textcontainer']";
type LoadedPage = ReturnType<typeof cheerio.load>;
type PageNode = Parameters<LoadedPage>[0];
type PageSelection = ReturnType<LoadedPage>;

function normalizedText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function visibleText(selection: PageSelection): string {
  const content = selection.clone();
  content.find("br").replaceWith(" ");
  content.find("sup").before(" ").after(" ");
  return normalizedText(content.text());
}

function validSourceMeta(sourceMeta: BulletinProgramPageSource): boolean {
  let url: URL;
  try {
    url = new URL(sourceMeta.url);
  } catch {
    return false;
  }

  const expectedPath =
    sourceMeta.kind === "core"
      ? CORE_PATH
      : `${PROGRAM_PATH}${sourceMeta.slug}/`;
  return (
    sourceMeta.slug !== "" &&
    sourceMeta.title !== "" &&
    url.protocol === "https:" &&
    url.hostname === "bulletins.nyu.edu" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    url.pathname === expectedPath &&
    (sourceMeta.kind !== "core" || sourceMeta.slug === "core-curriculum")
  );
}

function hasShanghaiBreadcrumb($: LoadedPage, sourceUrl: string): boolean {
  return $("nav[aria-label], .breadcrumb, .breadcrumbs, #breadcrumb")
    .filter((_index, element) => {
      const label = normalizedText($(element).attr("aria-label") ?? "");
      return label === "" || /^breadcrumbs?$/i.test(label);
    })
    .find("a[href]")
    .toArray()
    .some((anchor) => {
      try {
        const url = new URL($(anchor).attr("href") ?? "", sourceUrl);
        return (
          url.protocol === "https:" &&
          url.hostname === "bulletins.nyu.edu" &&
          url.port === "" &&
          url.username === "" &&
          url.password === "" &&
          url.search === "" &&
          url.hash === "" &&
          url.pathname === SHANGHAI_PATH
        );
      } catch {
        return false;
      }
    });
}

function unique(values: string[]): string[] {
  return values.filter(
    (value, index) => value !== "" && values.indexOf(value) === index,
  );
}

function tableSection($: LoadedPage, table: PageNode) {
  const section = $(table).parents("section[id], [id$='textcontainer']").first();
  const id = normalizedText(section.attr("id") ?? "");
  const heading = normalizedText(section.find("h2, h3, h4").first().text());
  return {
    id,
    heading,
    headingTrail: headingTrailForTable($, section, table),
    element: section,
  };
}

function headingTrailForTable(
  $: LoadedPage,
  section: PageSelection,
  table: PageNode,
): Array<{ level: 2 | 3 | 4 | 5 | 6; text: string }> {
  const trail: Array<{ level: 2 | 3 | 4 | 5 | 6; text: string }> = [];
  for (const element of section.find("h2, h3, h4, h5, h6, table").toArray()) {
    if (element === table) return trail;
    const tag = (element as { tagName?: string }).tagName?.toLowerCase();
    if (!tag || !/^h[2-6]$/.test(tag)) continue;
    const level = Number(tag[1]) as 2 | 3 | 4 | 5 | 6;
    const text = visibleText($(element));
    if (!text) continue;
    while (trail.at(-1) && trail.at(-1)!.level >= level) trail.pop();
    trail.push({ level, text });
  }
  return trail;
}

function isSamplePlanSection(id: string, heading: string): boolean {
  return /(?:sample[- ]?plan|plan[- ]?of[- ]?study)/i.test(`${id} ${heading}`);
}

function rowRole(
  $: LoadedPage,
  row: PageNode,
): SourceTableRowRole | undefined {
  const selection = $(row);
  const classes = normalizedText(selection.attr("class") ?? "")
    .toLowerCase()
    .split(" ");
  if (classes.includes("areaheader")) return "areaHeader";
  if (classes.includes("areasubheader")) return "areaSubheader";
  if (classes.includes("listsum") || classes.includes("total")) return "total";
  if (
    classes.includes("courselistcomment") ||
    selection.find(".courselistcomment").length > 0
  ) {
    return "comment";
  }
  if (selection.find(".codecol").length > 0) return "course";
  return undefined;
}

function rowText($: LoadedPage, row: PageNode): string {
  const cells = $(row).children("th, td").toArray();
  if (cells.length === 0) return visibleText($(row));
  return normalizedText(cells.map((cell) => visibleText($(cell))).join(" "));
}

function parseRow(
  $: LoadedPage,
  row: PageNode,
  sourceIndex: number,
  role: SourceTableRowRole,
): SourceTableRow {
  const selection = $(row);
  const creditsText = visibleText(selection.find(".hourscol").first());
  const codeText = visibleText(selection.find(".codecol").first());
  const sourceAnchors = unique(
    selection
      .find("a[href]")
      .toArray()
      .map((anchor) => normalizedText($(anchor).attr("href") ?? "")),
  );
  const footnoteMarkers = unique(
    selection
      .find("sup a[href^='#'], a.footnote[href^='#']")
      .toArray()
      .map((anchor) => visibleText($(anchor))),
  );

  return {
    role,
    sourceIndex,
    text: rowText($, row),
    creditsText: creditsText || undefined,
    linkedCourseCodes: unique(codeText.match(COURSE_CODE) ?? []),
    sourceAnchors,
    footnoteMarkers,
  };
}

function bodyRows($: LoadedPage, table: PageNode): PageNode[] {
  const rows = $(table).find("tbody > tr").toArray();
  return rows.length > 0 ? rows : $(table).children("tr").toArray();
}

function parseRequirementTable(
  $: LoadedPage,
  table: PageNode,
  id: string,
  sectionId: string,
  headingTrail: NonNullable<SourceTable["headingTrail"]>,
): SourceTable {
  const elements = bodyRows($, table);
  const rows = elements.map((row, sourceIndex) => {
    const role = rowRole($, row);
    if (!role) {
      throw new BulletinProgramParseError(
        `Bulletin table ${id} could not preserve requirement row order.`,
      );
    }
    return parseRow($, row, sourceIndex, role);
  });
  if (
    rows.length !== elements.length ||
    rows.some((row, index) => row.sourceIndex !== index)
  ) {
    throw new BulletinProgramParseError(
      `Bulletin table ${id} could not preserve requirement row order.`,
    );
  }

  const caption = visibleText($(table).find("caption").first());
  return {
    id,
    sectionId,
    ...(caption ? { caption } : {}),
    headingTrail,
    rows,
  };
}

function samplePlanOrdinal(heading: string): number | null {
  const semester = heading.match(/^(\d+)(?:st|nd|rd|th)\s+Semester(?:\/Term)?/i);
  if (semester) return Number(semester[1]);
  const yearTerm = heading.match(/^Year\s+(\d+)\s+(Fall|Spring)$/i);
  if (!yearTerm) return null;
  return (Number(yearTerm[1]) - 1) * 2 +
    (yearTerm[2].toLowerCase() === "fall" ? 1 : 2);
}

function samplePlanRow(
  $: LoadedPage,
  row: PageNode,
  sourceIndex: number,
): BulletinSamplePlanRow | null {
  const parsed = parseRow($, row, sourceIndex, rowRole($, row) ?? "course");
  const creditsText = parsed.creditsText ?? null;
  if (parsed.linkedCourseCodes.length > 0) {
    return {
      kind: "course",
      sourceIndex,
      text: parsed.text,
      creditsText,
      linkedCourseCodes: parsed.linkedCourseCodes,
      sourceAnchors: parsed.sourceAnchors,
    };
  }
  const label = normalizedText(
    $(row)
      .children("th, td")
      .filter((_index, cell) => !$(cell).hasClass("hourscol"))
      .toArray()
      .map((cell) => visibleText($(cell)))
      .filter(Boolean)
      .join(" "),
  );
  return label
    ? { kind: "placeholder", sourceIndex, label, creditsText }
    : null;
}

function samplePlanTermsFromTable(
  $: LoadedPage,
  table: PageNode,
  termOffset: number,
): { terms: BulletinSamplePlanTerm[]; totalCreditsText: string | null } {
  const rows = bodyRows($, table);
  const hasTermHeaders = rows.some((row) => {
    const classes = normalizedText($(row).attr("class") ?? "").toLowerCase();
    return classes.includes("plangridterm") || samplePlanOrdinal(rowText($, row)) !== null;
  });
  if (!hasTermHeaders) {
    const heading =
      visibleText($(table).find("caption").first()) ||
      normalizedText($(table).prevAll("h3, h4").first().text());
    const termRows = rows.flatMap((row, sourceIndex) => {
      const parsed = samplePlanRow($, row, sourceIndex);
      return parsed ? [parsed] : [];
    });
    return {
      terms: [{
        sourceIndex: termOffset,
        heading,
        ordinal: samplePlanOrdinal(heading),
        creditsText: null,
        rows: termRows,
      }],
      totalCreditsText: null,
    };
  }

  const terms: BulletinSamplePlanTerm[] = [];
  let current: BulletinSamplePlanTerm | undefined;
  let totalCreditsText: string | null = null;
  rows.forEach((row, sourceIndex) => {
    const text = rowText($, row);
    const classes = normalizedText($(row).attr("class") ?? "").toLowerCase();
    const ordinal = samplePlanOrdinal(text);
    if (classes.includes("plangridterm") || ordinal !== null) {
      current = {
        sourceIndex: termOffset + terms.length,
        heading: text.replace(/\s+Credits$/i, "").trim(),
        ordinal,
        creditsText: null,
        rows: [],
      };
      terms.push(current);
      return;
    }
    if (classes.includes("plangridtotal") || /^(?:Credits|Total Credits)\b/i.test(text)) {
      const credits = visibleText($(row).find(".hourscol").first()) || null;
      if (/Total Credits/i.test(text)) totalCreditsText = credits;
      else if (current) current.creditsText = credits;
      return;
    }
    if (!current) return;
    const parsed = samplePlanRow($, row, sourceIndex);
    if (parsed) current.rows.push(parsed);
  });
  return { terms, totalCreditsText };
}

function displayRow(row: SourceTableRow): BulletinDisplayRow {
  const role: BulletinDisplayRow["role"] =
    row.role === "total"
      ? "total"
      : row.linkedCourseCodes.length > 0
        ? "course"
        : /^(?:select|choose|complete)\b/i.test(row.text)
          ? "directive"
          : row.role === "areaHeader" || row.role === "areaSubheader"
            ? "heading"
            : "note";
  return {
    sourceIndex: row.sourceIndex,
    role,
    text: row.text,
    creditsText: row.creditsText ?? null,
    linkedCourseCodes: row.linkedCourseCodes,
    sourceAnchors: row.sourceAnchors,
    footnoteMarkers: row.footnoteMarkers,
  };
}

function requirementDisplay(
  $: LoadedPage,
  sourceUrl: string,
  tables: SourceTable[],
  tableSourceIds: ReadonlyMap<PageNode, string>,
): BulletinRequirementDocument {
  const tablesById = new Map(tables.map((table) => [table.id, table]));
  const sections = sourceContainers($).flatMap((element) => {
    const section = $(element);
    const sectionTables = section
      .find(REQUIREMENT_TABLE_SELECTOR)
      .toArray()
      .flatMap((table) => {
        const id = tableSourceIds.get(table) ?? normalizedText($(table).attr("id") ?? "");
        return tablesById.has(id) ? [tablesById.get(id)!] : [];
      });
    if (sectionTables.length === 0) return [];
    const blocks: BulletinRequirementDocument["sections"][number]["blocks"] = [];
    for (const node of section.find("h2, h3, h4, h5, h6, p, table").toArray()) {
      const selection = $(node);
      const tag = (node as { tagName?: string }).tagName?.toLowerCase() ?? "";
      if (/^h[2-6]$/.test(tag)) {
        const text = visibleText(selection);
        if (text) blocks.push({ kind: "heading", level: Number(tag[1]) as 2 | 3 | 4 | 5 | 6, text });
        continue;
      }
      if (tag === "p" && selection.parents("table, .footnotes").length === 0) {
        const text = visibleText(selection);
        if (text) blocks.push({ kind: "prose", paragraphs: [text] });
        continue;
      }
      if (tag === "table") {
        const id = tableSourceIds.get(node) ?? normalizedText(selection.attr("id") ?? "");
        const table = tablesById.get(id);
        if (table) {
          blocks.push({
            kind: "table",
            id: table.id,
            caption: table.caption ?? null,
            headingTrail: table.headingTrail ?? [],
            rows: table.rows.map(displayRow),
          });
        }
      }
    }
    return [{
      id: normalizedText(section.attr("id") ?? ""),
      heading: normalizedText(section.find("h2, h3, h4").first().text()),
      blocks,
    }];
  });
  return { schemaVersion: 2, sourceUrl, sections };
}

function sourceContainers($: LoadedPage): PageNode[] {
  return $(SOURCE_CONTAINER_SELECTOR)
    .filter((_index, container) =>
      $(container).parents(SOURCE_CONTAINER_SELECTOR).length === 0,
    )
    .toArray();
}

function sectionProse($: LoadedPage, section: PageSelection): string[] {
  const boundary = "\u241e";
  const content = section.clone();
  content
    .find("h1, h2, h3, h4, h5, h6, table, .footnotes, .footnote")
    .remove();
  content.find("br").replaceWith(" ");
  content.find("p, li, dt, dd, blockquote").each((_index, element) => {
    $(element).before(boundary).after(boundary);
  });
  return content
    .text()
    .split(boundary)
    .map(normalizedText)
    .filter(Boolean);
}

function parseSections($: LoadedPage): SourceSection[] {
  return sourceContainers($)
    .map((section) => {
      const selection = $(section);
      const id = normalizedText(selection.attr("id") ?? "");
      const heading = normalizedText(selection.find("h2, h3, h4").first().text());
      const prose = sectionProse($, selection);
      const tableIds = selection
        .find(REQUIREMENT_TABLE_SELECTOR)
        .toArray()
        .map((table) => normalizedText($(table).attr("id") ?? ""));
      return {
        id,
        heading,
        text: normalizedText(prose.join(" ")),
        prose,
        tableIds,
      };
    });
}

function parseFootnotes($: LoadedPage): SourceFootnote[] {
  return $(".footnotes li[id], .footnote[id]")
    .toArray()
    .map((footnote) => {
      const selection = $(footnote);
      const id = normalizedText(selection.attr("id") ?? "");
      const linkedMarker = $(
        `a[href="#${id.replace(/["\\]/g, "\\$&")}"]`,
      )
        .toArray()
        .map((anchor) => visibleText($(anchor)))
        .find(Boolean);
      const text = visibleText(selection);
      const literalMarker = text.match(/^(?:\d+|[*†‡])(?=\s)/)?.[0] ?? "";
      return {
        id,
        marker: linkedMarker ?? literalMarker,
        text,
      };
    });
}

function isDegreePage(sourceMeta: BulletinProgramPageSource): boolean {
  return (
    sourceMeta.kind === "major" &&
    /(?:\(\s*B[AS]\s*\)|\bBachelor of (?:Arts|Science)\b|\bB\.?[AS]\.?)\b/i.test(
      sourceMeta.title,
    )
  );
}

export function parseProgramPage(
  html: string,
  sourceMeta: BulletinProgramPageSource,
): BulletinProgramDocument {
  const $ = cheerio.load(html);
  const heading = normalizedText($("h1").first().text());
  if (
    !validSourceMeta(sourceMeta) ||
    heading !== normalizedText(sourceMeta.title) ||
    !hasShanghaiBreadcrumb($, sourceMeta.url)
  ) {
    throw new BulletinProgramParseError(
      "The Shanghai program or Core page identity could not be verified.",
    );
  }

  const allTables = $(REQUIREMENT_TABLE_SELECTOR).toArray();
  const tableIds = new Set<string>();
  const tableSourceIds = new Map<PageNode, string>();
  const sectionTableCounts = new Map<string, number>();
  for (const table of allTables) {
    let id = normalizedText($(table).attr("id") ?? "");
    if (id === "") {
      const sectionId = tableSection($, table).id;
      if (sectionId === "") {
        throw new BulletinProgramParseError(
          "A Bulletin curriculum table is missing its source ID.",
        );
      }
      const ordinal = (sectionTableCounts.get(sectionId) ?? 0) + 1;
      sectionTableCounts.set(sectionId, ordinal);
      id = `${sectionId}-table-${ordinal}`;
    }
    if (tableIds.has(id)) {
      throw new BulletinProgramParseError(`Duplicate Bulletin table ID: ${id}.`);
    }
    tableIds.add(id);
    tableSourceIds.set(table, id);
  }

  const requirementTables: SourceTable[] = [];
  const sampleTables: Array<{
    table: PageNode;
    sectionId: string;
    heading: string;
  }> = [];
  let samplePlanSection: { id: string; heading: string } | undefined;
  for (const table of allTables) {
    const id = tableSourceIds.get(table)!;
    const section = tableSection($, table);
    const samplePlan =
      $(table).hasClass("sample-plan-term") ||
      isSamplePlanSection(section.id, section.heading);
    if (samplePlan) {
      samplePlanSection ??= { id: section.id, heading: section.heading };
      sampleTables.push({
        table,
        sectionId: section.id,
        heading: section.heading,
      });
    } else {
      requirementTables.push(
        parseRequirementTable(
          $,
          table,
          id,
          section.id,
          section.headingTrail,
        ),
      );
    }
  }

  if (
    isDegreePage(sourceMeta) &&
    !requirementTables.some((table) => table.rows.length > 0)
  ) {
    throw new BulletinProgramParseError(
      "The Shanghai BA/BS page did not contain degree requirements.",
    );
  }

  const sections = parseSections($);
  const policies = sourceContainers($)
    .filter((section) => {
      const selection = $(section);
      const headingText = normalizedText(
        selection.find("h2, h3, h4").first().text(),
      );
      return (
        selection.hasClass("policy-section") ||
        /(?:polic|waiver|declaration|proficienc)/i.test(headingText)
      );
    })
    .map((section) => {
      const selection = $(section);
      return {
        id: normalizedText(selection.attr("id") ?? ""),
        heading: normalizedText(selection.find("h2, h3, h4").first().text()),
        text: normalizedText(sectionProse($, selection).join(" ")),
      };
    });

  let samplePlan: BulletinSamplePlan | undefined;
  if (samplePlanSection) {
    const terms: BulletinSamplePlanTerm[] = [];
    let totalCreditsText: string | null = null;
    for (const { table } of sampleTables) {
      const parsed = samplePlanTermsFromTable($, table, terms.length);
      terms.push(...parsed.terms);
      if (parsed.totalCreditsText !== null) {
        totalCreditsText = parsed.totalCreditsText;
      }
    }

    const importEligible =
      terms.length === 8 &&
      terms.every((term, index) => term.ordinal === index + 1);
    samplePlan = {
      sectionId: samplePlanSection.id,
      heading: samplePlanSection.heading,
      terms,
      totalCreditsText,
      importStatus: importEligible ? "eligible" : "display-only",
      diagnostics: importEligible
        ? []
        : [
            {
              code: "nonstandard-term-sequence",
              message: `Sample plan has ${terms.length} terms without one unambiguous 1–8 sequence.`,
            },
          ],
    };
  }

  return {
    kind: sourceMeta.kind === "core" ? "core" : "program",
    slug: sourceMeta.slug,
    title: sourceMeta.title,
    sourceUrl: sourceMeta.url,
    bulletinDisplay: requirementDisplay(
      $,
      sourceMeta.url,
      requirementTables,
      tableSourceIds,
    ),
    sections,
    requirementTables,
    policies,
    footnotes: parseFootnotes($),
    ...(samplePlan ? { samplePlan } : {}),
  };
}
