import * as cheerio from "cheerio";
import {
  BULLETIN_ORIGIN,
  BULLETIN_SHANGHAI_PATH,
  COURSE_INDEX_URL,
  PROGRAM_INDEX_URL,
  SITEMAP_URL,
} from "@/lib/bulletin/constants";
import type { BulletinFetch } from "@/lib/bulletin/fetch";
import type {
  BulletinDiscovery,
  BulletinProgramKind,
  BulletinProgramSource,
  BulletinSubjectSource,
} from "@/lib/bulletin/sourceTypes";

export class BulletinDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BulletinDiscoveryError";
  }
}

const PROGRAM_PATH = `${BULLETIN_SHANGHAI_PATH}programs/`;
const COURSE_PATH = `${BULLETIN_SHANGHAI_PATH}courses/`;
const DEGREE_CREDENTIAL =
  /(?:\bbachelor(?:'s)?\b|\bB\.?\s*[AS]\.?\b)/i;
const SUBJECT_CODE = /\b[A-Z]{2,}(?:-[A-Z]{2,})\b/;

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hasIndexIdentity(html: string, identity: "Programs" | "Courses") {
  const $ = cheerio.load(html);
  const expected = new Set([
    identity.toLowerCase(),
    `nyu shanghai ${identity.toLowerCase()}`,
    ...(identity === "Courses" ? ["course inventory a-z"] : []),
  ]);
  return $("h1")
    .toArray()
    .some((heading) => expected.has(normalizedText($(heading).text()).toLowerCase()));
}

function programKind(text: string): BulletinProgramKind | undefined {
  if (/\bminor\b/i.test(text)) return "minor";
  if (DEGREE_CREDENTIAL.test(text)) return "major";
  return undefined;
}

function canonicalSourceUrl(
  href: string,
  indexUrl: string,
  requiredPath: string,
): { slug: string; url: string } {
  let url: URL;
  try {
    url = new URL(href, indexUrl);
  } catch {
    throw new BulletinDiscoveryError(
      "A Bulletin index contained a source URL outside the allowlist.",
    );
  }

  const isAllowed =
    url.protocol === "https:" &&
    url.hostname === new URL(BULLETIN_ORIGIN).hostname &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.pathname.startsWith(requiredPath);
  const remainder = url.pathname.slice(requiredPath.length).replace(/\/+$/, "");

  if (!isAllowed || remainder === "" || remainder.includes("/")) {
    throw new BulletinDiscoveryError(
      "A Bulletin index contained a source URL outside the allowlist.",
    );
  }

  const slug = remainder.toLowerCase();
  return {
    slug,
    url: `${BULLETIN_ORIGIN}${requiredPath}${slug}/`,
  };
}

function parsePrograms(html: string): BulletinProgramSource[] {
  if (!hasIndexIdentity(html, "Programs")) {
    throw new BulletinDiscoveryError(
      "The Bulletin programs index identity could not be verified.",
    );
  }

  const $ = cheerio.load(html);
  const sources = new Map<string, BulletinProgramSource>();
  $("a[href]").each((_index, anchor) => {
    const title = normalizedText($(anchor).text());
    const kind = programKind(title);
    if (!kind) return;

    const source = canonicalSourceUrl(
      $(anchor).attr("href") ?? "",
      PROGRAM_INDEX_URL,
      PROGRAM_PATH,
    );
    sources.set(source.url, { ...source, kind, title });
  });
  return [...sources.values()].sort((left, right) =>
    left.slug.localeCompare(right.slug),
  );
}

function hasSubjectDetailPath(href: string): boolean {
  try {
    const url = new URL(href, COURSE_INDEX_URL);
    if (!url.pathname.startsWith(COURSE_PATH)) return false;
    const remainder = url.pathname.slice(COURSE_PATH.length);
    return /^[a-z0-9-]+-shu\/?$/i.test(remainder);
  } catch {
    return false;
  }
}

function parseSubjects(html: string): BulletinSubjectSource[] {
  if (!hasIndexIdentity(html, "Courses")) {
    throw new BulletinDiscoveryError(
      "The Bulletin courses index identity could not be verified.",
    );
  }

  const $ = cheerio.load(html);
  const sources = new Map<string, BulletinSubjectSource>();
  $("a[href]").each((_index, anchor) => {
    const title = normalizedText($(anchor).text());
    const href = $(anchor).attr("href") ?? "";
    const appearsToBeSubject =
      SUBJECT_CODE.test(title) || hasSubjectDetailPath(href);
    if (!appearsToBeSubject) return;

    const source = canonicalSourceUrl(href, COURSE_INDEX_URL, COURSE_PATH);
    sources.set(source.url, { ...source, kind: "subject", title });
  });
  return [...sources.values()].sort((left, right) =>
    left.slug.localeCompare(right.slug),
  );
}

function sitemapUrls(xml: string): Set<string> {
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls = new Set<string>();
  $("loc").each((_index, loc) => {
    const value = normalizedText($(loc).text());
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return;
    }
    if (
      url.protocol !== "https:" ||
      url.hostname !== new URL(BULLETIN_ORIGIN).hostname ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      !url.pathname.startsWith(BULLETIN_SHANGHAI_PATH)
    ) {
      return;
    }
    urls.add(value);
  });
  return urls;
}

function assertNonEmpty(discovery: BulletinDiscovery) {
  if (
    discovery.majors.length === 0 ||
    discovery.minors.length === 0 ||
    discovery.subjects.length === 0
  ) {
    throw new BulletinDiscoveryError(
      "A Bulletin index did not list any allowed sources.",
    );
  }
}

function assertSitemapMembership(
  discovery: BulletinDiscovery,
  sitemap: ReadonlySet<string>,
) {
  const sources = [
    ...discovery.majors,
    ...discovery.minors,
    ...discovery.subjects,
  ];
  if (sources.some((source) => !sitemap.has(source.url))) {
    throw new BulletinDiscoveryError(
      "A discovered source could not be verified in the Bulletin sitemap.",
    );
  }
}

export async function discoverBulletinSources(
  fetcher: BulletinFetch,
): Promise<BulletinDiscovery> {
  let programHtml: string;
  let courseHtml: string;
  let sitemapXml: string;
  try {
    programHtml = await fetcher(PROGRAM_INDEX_URL);
    courseHtml = await fetcher(COURSE_INDEX_URL);
    sitemapXml = await fetcher(SITEMAP_URL);
  } catch {
    throw new BulletinDiscoveryError(
      "Unable to fetch NYU Shanghai Bulletin indexes.",
    );
  }

  const programs = parsePrograms(programHtml);
  const discovery: BulletinDiscovery = {
    majors: programs.filter((source) => source.kind === "major"),
    minors: programs.filter((source) => source.kind === "minor"),
    subjects: parseSubjects(courseHtml),
  };
  assertNonEmpty(discovery);
  assertSitemapMembership(discovery, sitemapUrls(sitemapXml));
  return discovery;
}
