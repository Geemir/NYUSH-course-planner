import * as cheerio from "cheerio";
import type { BulletinProgramKind } from "@/lib/bulletin/sourceTypes";

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

export interface SourceSamplePlanTerm {
  id: string;
  heading: string;
  rows: SourceTableRow[];
}

export interface SourceSamplePlan {
  sectionId: string;
  heading: string;
  terms: SourceSamplePlanTerm[];
}

export interface BulletinProgramDocument {
  kind: "program" | "core";
  slug: string;
  title: string;
  sourceUrl: string;
  sections: SourceSection[];
  requirementTables: SourceTable[];
  policies: SourcePolicy[];
  footnotes: SourceFootnote[];
  samplePlan?: SourceSamplePlan;
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
const COURSE_CODE = /\b[A-Z]{2,}(?:-[A-Z]{2,})+\s+\d{1,4}[A-Z]?\b/g;
const REQUIREMENT_TABLE_SELECTOR = "table.sc_courselist, table.sc_plangrid";
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
      return label === "" || label.toLowerCase() === "breadcrumb";
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
  return { id, heading, element: section };
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
    rows,
  };
}

function parseSamplePlanTerm(
  $: LoadedPage,
  table: PageNode,
  id: string,
): SourceSamplePlanTerm {
  const rows = bodyRows($, table).map((row, sourceIndex) => {
    const role = rowRole($, row) ?? "course";
    return parseRow($, row, sourceIndex, role);
  });
  const heading =
    visibleText($(table).find("caption").first()) ||
    normalizedText($(table).prevAll("h3, h4").first().text());
  return { id, heading, rows };
}

function sectionParagraphs($: LoadedPage, section: PageSelection): string[] {
  return section
    .find("p")
    .filter((_index, paragraph) =>
      $(paragraph).parents("table, .footnotes").length === 0 &&
      !$(paragraph).is(".footnote"),
    )
    .toArray()
    .map((paragraph) => visibleText($(paragraph)))
    .filter(Boolean);
}

function parseSections($: LoadedPage): SourceSection[] {
  return $("main section[id]")
    .toArray()
    .map((section) => {
      const selection = $(section);
      const id = normalizedText(selection.attr("id") ?? "");
      const heading = normalizedText(selection.find("h2, h3, h4").first().text());
      const prose = sectionParagraphs($, selection);
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
  for (const table of allTables) {
    const id = normalizedText($(table).attr("id") ?? "");
    if (id === "") {
      throw new BulletinProgramParseError(
        "A Bulletin curriculum table is missing its source ID.",
      );
    }
    if (tableIds.has(id)) {
      throw new BulletinProgramParseError(`Duplicate Bulletin table ID: ${id}.`);
    }
    tableIds.add(id);
  }

  const requirementTables: SourceTable[] = [];
  const sampleTerms: SourceSamplePlanTerm[] = [];
  let samplePlanSection: { id: string; heading: string } | undefined;
  for (const table of allTables) {
    const id = normalizedText($(table).attr("id") ?? "");
    const section = tableSection($, table);
    const samplePlan =
      $(table).hasClass("sample-plan-term") ||
      isSamplePlanSection(section.id, section.heading);
    if (samplePlan) {
      samplePlanSection ??= { id: section.id, heading: section.heading };
      sampleTerms.push(parseSamplePlanTerm($, table, id));
    } else {
      requirementTables.push(parseRequirementTable($, table, id, section.id));
    }
  }

  if (isDegreePage(sourceMeta) && requirementTables.length === 0) {
    throw new BulletinProgramParseError(
      "The Shanghai BA/BS page did not contain degree requirements.",
    );
  }

  const sections = parseSections($);
  const policies = $("main section[id]")
    .toArray()
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
        text: normalizedText(sectionParagraphs($, selection).join(" ")),
      };
    });

  return {
    kind: sourceMeta.kind === "core" ? "core" : "program",
    slug: sourceMeta.slug,
    title: sourceMeta.title,
    sourceUrl: sourceMeta.url,
    sections,
    requirementTables,
    policies,
    footnotes: parseFootnotes($),
    ...(samplePlanSection
      ? {
          samplePlan: {
            sectionId: samplePlanSection.id,
            heading: samplePlanSection.heading,
            terms: sampleTerms,
          },
        }
      : {}),
  };
}
