import * as cheerio from "cheerio";
import type { BulletinSubjectSource } from "@/lib/bulletin/sourceTypes";

export interface SourceCourse {
  code: string;
  title: string;
  creditsText?: string;
  description?: string;
  offeringText?: string;
  prerequisiteText?: string;
  linkedCourseIds: string[];
  attributes: string[];
  detailTexts: string[];
}

export interface BulletinSourceDocument {
  kind: "subject";
  slug: string;
  title: string;
  sourceUrl: string;
  courses: SourceCourse[];
}

export class BulletinParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BulletinParseError";
  }
}

const SUBJECT_PATH = "/undergraduate/shanghai/courses/";
const COURSE_ID =
  /^[A-Z]{2,}(?:-[A-Z]{2,})+\s+\d{1,4}[A-Z]?(?:-[A-Z])?$/;
const LINKED_COURSE_IDS =
  /\b[A-Z]{2,}(?:-[A-Z]{2,})+\s+\d{1,4}[A-Z]?(?:-[A-Z])?\b/g;
const DETAIL_SELECTOR = ".courseblockextra";
type LoadedPage = ReturnType<typeof cheerio.load>;
type PageNode = Parameters<LoadedPage>[0];
type PageSelection = ReturnType<LoadedPage>;

function normalizedText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizedPlainText(selection: PageSelection): string {
  const content = selection.clone();
  content.find("br").replaceWith(" ");
  content
    .find("p, div, li, dt, dd, tr")
    .before(" ")
    .after(" ");
  return normalizedText(content.text());
}

function validSourceMeta(sourceMeta: BulletinSubjectSource): boolean {
  let url: URL;
  try {
    url = new URL(sourceMeta.url);
  } catch {
    return false;
  }

  return (
    sourceMeta.kind === "subject" &&
    sourceMeta.slug !== "" &&
    url.protocol === "https:" &&
    url.hostname === "bulletins.nyu.edu" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    url.pathname === `${SUBJECT_PATH}${sourceMeta.slug}/`
  );
}

function labelText(value: string): string {
  return normalizedText(value).replace(/\s*:$/, "");
}

function parseDetail(
  $: LoadedPage,
  element: PageNode,
) {
  const detail = $(element);
  const labelElement = detail.find("strong, b").first();
  const label = labelText(labelElement.text());
  const body = detail.clone();
  body.find("strong, b").first().remove();
  return {
    element: detail,
    label,
    text: normalizedPlainText(body).replace(/^:\s*/, ""),
  };
}

function courseTitle(
  $: LoadedPage,
  block: PageNode,
): string {
  const detailTitle = normalizedText($(block).find(".detail-title").first().text());
  if (detailTitle !== "") return detailTitle;

  const titleLine = $(block).find(".courseblocktitle").first();
  if (titleLine.length === 0) return "";

  const titleContent = titleLine.clone();
  titleContent
    .find(
      ".courseblockcode, .coursecode, .courseblockhours, .courseblockcredits, .credits",
    )
    .remove();
  const title = normalizedText(titleContent.text());
  return title.replace(/^[\s.:;-]+/, "").trim();
}

function parseLiveCourseExtra(selection: PageSelection) {
  const text = normalizedText(selection.find(DETAIL_SELECTOR).first().text());
  const details: Array<{ label: string; text: string }> = [];
  const labelPattern =
    /\b(Prerequisite(?:s|\(s\))?|Offered|Offering|Course Attributes?(?:\(s\))?|Fulfillment):\s*/gi;
  const matches = [...text.matchAll(labelPattern)];

  for (const [index, match] of matches.entries()) {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    details.push({
      label: labelText(match[1]),
      text: normalizedText(text.slice(start, end)),
    });
  }

  return {
    description: normalizedText(text.slice(0, matches[0]?.index ?? text.length)),
    details,
  };
}

function liveOfferingText(selection: PageSelection): string {
  const offering = selection.find(".detail-typically_offered").first().clone();
  offering.find(".label").first().remove();
  return normalizedText(offering.text());
}

function parseCourse(
  $: LoadedPage,
  block: PageNode,
): SourceCourse {
  const selection = $(block);
  const codeText = normalizedText(
    selection
      .find(".courseblocktitle .courseblockcode, .courseblocktitle .coursecode, .detail-code")
      .first()
      .text(),
  );
  const code = COURSE_ID.test(codeText) ? codeText : "";
  if (code === "") {
    throw new BulletinParseError("A Bulletin course block is missing its code.");
  }

  const creditsText = normalizedText(
    selection
      .find(
        ".courseblocktitle .courseblockhours, .courseblocktitle .courseblockcredits, .courseblocktitle .credits, .detail-hours_html",
      )
      .first()
      .text(),
  );
  const title = courseTitle($, block);
  if (title === "") {
    throw new BulletinParseError(`Bulletin course ${code} is missing its title.`);
  }

  const legacyDescription = normalizedText(
    selection
      .find(".courseblockdesc")
      .toArray()
      .map((element) => normalizedPlainText($(element)))
      .join(" "),
  );
  const liveMarkup = selection.find(".detail-code").length > 0;
  const live = liveMarkup
    ? parseLiveCourseExtra(selection)
    : { description: "", details: [] };
  const description = legacyDescription || live.description;
  const details = liveMarkup
    ? live.details
    : selection
        .find(DETAIL_SELECTOR)
        .toArray()
        .map((element) => parseDetail($, element));
  const prerequisite = details.find((detail) =>
    /^prerequisite(?:s|\(s\))?$/i.test(detail.label),
  );
  const offering = details.find((detail) =>
    /^(?:offered|offering)$/i.test(detail.label),
  );
  const attributeDetail = details.find((detail) =>
    /^(?:course\s+)?attributes?(?:\(s\))?$/i.test(detail.label),
  );
  const linkedCourseIds = prerequisite
    ? (prerequisite.text.match(LINKED_COURSE_IDS) ?? []).filter(
        (courseId, index, values) => values.indexOf(courseId) === index,
      )
    : [];
  const attributes = attributeDetail
    ? attributeDetail.text
        .split(/[;,]/)
        .map(normalizedText)
        .filter(Boolean)
    : [];
  const offeringText =
    offering?.text || (liveMarkup ? liveOfferingText(selection) : "");

  return {
    code,
    title,
    ...(creditsText ? { creditsText } : {}),
    ...(description ? { description } : {}),
    ...(offeringText ? { offeringText } : {}),
    ...(prerequisite?.text
      ? { prerequisiteText: prerequisite.text }
      : {}),
    linkedCourseIds,
    attributes,
    detailTexts: details.map((detail) => `${detail.label}: ${detail.text}`),
  };
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
      let url: URL;
      try {
        url = new URL($(anchor).attr("href") ?? "", sourceUrl);
      } catch {
        return false;
      }
      return (
        url.protocol === "https:" &&
        url.hostname === "bulletins.nyu.edu" &&
        url.port === "" &&
        url.username === "" &&
        url.password === "" &&
        url.search === "" &&
        url.hash === "" &&
        url.pathname === "/undergraduate/shanghai/"
      );
    });
}

export function parseCoursePage(
  html: string,
  sourceMeta: BulletinSubjectSource,
): BulletinSourceDocument {
  const $ = cheerio.load(html);
  const heading = normalizedText($("h1").first().text());
  if (
    !validSourceMeta(sourceMeta) ||
    heading !== normalizedText(sourceMeta.title) ||
    !hasShanghaiBreadcrumb($, sourceMeta.url)
  ) {
    throw new BulletinParseError(
      "The Shanghai subject page identity could not be verified.",
    );
  }

  const blocks = $(".courseblock").toArray();
  if (blocks.length === 0) {
    throw new BulletinParseError(
      "The Shanghai subject page did not contain any course blocks.",
    );
  }

  const courses = blocks.map((block) => parseCourse($, block));
  const codes = new Set<string>();
  for (const course of courses) {
    if (codes.has(course.code)) {
      throw new BulletinParseError(
        `Duplicate Bulletin course code: ${course.code}.`,
      );
    }
    codes.add(course.code);
  }

  return {
    kind: "subject",
    slug: sourceMeta.slug,
    title: sourceMeta.title,
    sourceUrl: sourceMeta.url,
    courses,
  };
}
