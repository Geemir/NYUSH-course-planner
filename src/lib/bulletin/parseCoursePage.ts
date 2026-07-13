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
const COURSE_ID = /\b[A-Z]{2,}(?:-[A-Z]{2,})+\s+\d{1,4}[A-Z]?\b/;
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
  code: string,
  creditsText?: string,
): string {
  const titleLine = $(block).find(".courseblocktitle").first();
  if (titleLine.length === 0) return "";

  const titleContent = titleLine.clone();
  titleContent
    .find(
      ".courseblockcode, .coursecode, .courseblockhours, .courseblockcredits, .credits",
    )
    .remove();
  let title = normalizedText(titleContent.text());
  title = normalizedText(title.replace(code, ""));
  if (creditsText) title = normalizedText(title.replace(creditsText, ""));
  return title.replace(/^[\s.:;-]+/, "").trim();
}

function parseCourse(
  $: LoadedPage,
  block: PageNode,
): SourceCourse {
  const selection = $(block);
  const titleLine = selection.find(".courseblocktitle").first();
  const codeText = normalizedText(
    titleLine.find(".courseblockcode, .coursecode").first().text(),
  );
  const code = codeText.match(COURSE_ID)?.[0] ?? "";
  if (code === "") {
    throw new BulletinParseError("A Bulletin course block is missing its code.");
  }

  const creditsText = normalizedText(
    titleLine
      .find(".courseblockhours, .courseblockcredits, .credits")
      .first()
      .text(),
  );
  const title = courseTitle($, block, code, creditsText || undefined);
  if (title === "") {
    throw new BulletinParseError(`Bulletin course ${code} is missing its title.`);
  }

  const description = normalizedText(
    selection
      .find(".courseblockdesc")
      .toArray()
      .map((element) => normalizedPlainText($(element)))
      .join(" "),
  );
  const details = selection
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
    ? prerequisite.element
        .find("a")
        .toArray()
        .flatMap((anchor) => normalizedText($(anchor).text()).match(COURSE_ID) ?? [])
        .filter((courseId, index, values) => values.indexOf(courseId) === index)
    : [];
  const attributes = attributeDetail
    ? attributeDetail.text
        .split(/[;,]/)
        .map(normalizedText)
        .filter(Boolean)
    : [];

  return {
    code,
    title,
    ...(creditsText ? { creditsText } : {}),
    ...(description ? { description } : {}),
    ...(offering?.text ? { offeringText: offering.text } : {}),
    ...(prerequisite?.text
      ? { prerequisiteText: prerequisite.text }
      : {}),
    linkedCourseIds,
    attributes,
    detailTexts: details.map((detail) =>
      normalizedPlainText(detail.element),
    ),
  };
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
  const titles = new Set<string>();
  for (const course of courses) {
    if (codes.has(course.code)) {
      throw new BulletinParseError(
        `Duplicate Bulletin course code: ${course.code}.`,
      );
    }
    const normalizedTitle = course.title.toLocaleLowerCase("en-US");
    if (titles.has(normalizedTitle)) {
      throw new BulletinParseError(
        `Duplicate Bulletin course title: ${course.title}.`,
      );
    }
    codes.add(course.code);
    titles.add(normalizedTitle);
  }

  return {
    kind: "subject",
    slug: sourceMeta.slug,
    title: sourceMeta.title,
    sourceUrl: sourceMeta.url,
    courses,
  };
}
