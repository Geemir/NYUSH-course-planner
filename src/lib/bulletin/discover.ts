import * as cheerio from "cheerio";
import { BULLETIN_ORIGIN, SITEMAP_URL } from "@/lib/bulletin/constants";
import type { BulletinFetch } from "@/lib/bulletin/fetch";
import { getCatalogSource } from "@/lib/bulletin/sourceRegistry";
import type {
  BulletinDiscovery,
  BulletinProgramKind,
  BulletinProgramSource,
  BulletinSubjectSource,
} from "@/lib/bulletin/sourceTypes";
import type { CatalogSourceDefinition } from "@/lib/catalog/types";

export class BulletinDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BulletinDiscoveryError";
  }
}

const DEGREE_CREDENTIAL = /(?:\bbachelor(?:'s)?\b|\bB\.?\s*[AS]\.?\b)/i;
const SUBJECT_CODE = /\b[A-Z]{2,}(?:-[A-Z]{2,})\b/;

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hasIndexIdentity(html: string, identity: "Programs" | "Courses") {
  const $ = cheerio.load(html);
  return $("h1")
    .toArray()
    .some((heading) => {
      const text = normalizedText($(heading).text()).toLowerCase();
      if (identity === "Courses") {
        return text === "course inventory a-z" || /(?:^|\s)courses$/.test(text);
      }
      return text === "programs" || text === "nyu shanghai programs";
    });
}

function programKind(text: string): BulletinProgramKind | undefined {
  if (/\bminor\b/i.test(text)) return "minor";
  if (DEGREE_CREDENTIAL.test(text)) return "major";
  return undefined;
}

function childUrl(
  href: string,
  indexUrl: string,
  requiredPath: string,
): { slug: string; url: string } | undefined {
  let url: URL;
  try {
    url = new URL(href, indexUrl);
  } catch {
    return undefined;
  }
  const bulletinHost = new URL(BULLETIN_ORIGIN).hostname;
  if (
    url.protocol !== "https:" ||
    url.hostname !== bulletinHost ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    !url.pathname.startsWith(requiredPath)
  ) {
    return undefined;
  }
  const remainder = url.pathname.slice(requiredPath.length).replace(/\/+$/, "");
  if (remainder === "" || remainder.includes("/")) return undefined;
  const slug = remainder.toLowerCase();
  return { slug, url: `${BULLETIN_ORIGIN}${requiredPath}${slug}/` };
}

function parsePrograms(
  html: string,
  source: CatalogSourceDefinition,
): BulletinProgramSource[] {
  if (!hasIndexIdentity(html, "Programs")) {
    throw new BulletinDiscoveryError(
      "The Bulletin programs index identity could not be verified.",
    );
  }
  const indexUrl = `${source.bulletinRoot}programs/`;
  const path = new URL(indexUrl).pathname;
  const $ = cheerio.load(html);
  const programs = new Map<string, BulletinProgramSource>();
  $("a[href]").each((_index, anchor) => {
    const title = normalizedText($(anchor).text());
    const kind = programKind(title);
    if (!kind) return;
    const item = childUrl($(anchor).attr("href") ?? "", indexUrl, path);
    if (!item) {
      throw new BulletinDiscoveryError(
        "A Bulletin index contained a source URL outside the allowlist.",
      );
    }
    programs.set(item.url, { ...item, kind, title });
  });
  return [...programs.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function parseSubjects(
  html: string,
  source: CatalogSourceDefinition,
): BulletinSubjectSource[] {
  if (!hasIndexIdentity(html, "Courses")) {
    throw new BulletinDiscoveryError(
      "The Bulletin courses index identity could not be verified.",
    );
  }
  const path = new URL(source.courseIndexUrl).pathname;
  const $ = cheerio.load(html);
  const subjects = new Map<string, BulletinSubjectSource>();
  $("a[href]").each((_index, anchor) => {
    const title = normalizedText($(anchor).text());
    const href = $(anchor).attr("href") ?? "";
    const item = childUrl(href, source.courseIndexUrl, path);
    if (!item || (!SUBJECT_CODE.test(title) && !/-[a-z]{2,}$/i.test(item.slug))) {
      return;
    }
    subjects.set(item.url, { ...item, kind: "subject", title });
  });
  return [...subjects.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function sitemapUrls(xml: string, source: CatalogSourceDefinition): Set<string> {
  const $ = cheerio.load(xml, { xmlMode: true });
  const rootPath = new URL(source.bulletinRoot).pathname;
  const urls = new Set<string>();
  $("loc").each((_index, loc) => {
    const value = normalizedText($(loc).text());
    try {
      const url = new URL(value);
      if (
        url.protocol === "https:" &&
        url.hostname === new URL(BULLETIN_ORIGIN).hostname &&
        url.port === "" &&
        url.username === "" &&
        url.password === "" &&
        url.pathname.startsWith(rootPath)
      ) {
        urls.add(value);
      }
    } catch {
      // Ignore malformed sitemap entries; membership checks remain fail-closed.
    }
  });
  return urls;
}

function assertDiscovery(discovery: BulletinDiscovery) {
  const missingPrograms =
    discovery.source.includePrograms &&
    (discovery.majors.length === 0 || discovery.minors.length === 0);
  if (missingPrograms || discovery.subjects.length === 0) {
    throw new BulletinDiscoveryError(
      "A Bulletin index did not list any allowed sources.",
    );
  }
}

export async function discoverBulletinSource(
  source: CatalogSourceDefinition,
  fetcher: BulletinFetch,
): Promise<BulletinDiscovery> {
  const programIndexUrl = `${source.bulletinRoot}programs/`;
  try {
    const [programHtml, courseHtml, sitemapXml] = await Promise.all([
      source.includePrograms ? fetcher(programIndexUrl) : Promise.resolve(""),
      fetcher(source.courseIndexUrl),
      fetcher(SITEMAP_URL),
    ]);
    const programs = source.includePrograms
      ? parsePrograms(programHtml, source)
      : [];
    const subjects = parseSubjects(courseHtml, source);
    const discovery: BulletinDiscovery = {
      sourceId: source.id,
      source,
      majors: programs.filter((item) => item.kind === "major"),
      minors: programs.filter((item) => item.kind === "minor"),
      subjects,
      programUrls: programs.map((item) => item.url),
      courseIndexUrls: [source.courseIndexUrl],
      coursePageUrls: subjects.map((item) => item.url),
      discoveredUrls: [
        ...(source.includePrograms ? [programIndexUrl] : []),
        source.courseIndexUrl,
        ...programs.map((item) => item.url),
        ...subjects.map((item) => item.url),
      ],
    };
    assertDiscovery(discovery);
    const sitemap = sitemapUrls(sitemapXml, source);
    if ([...programs, ...subjects].some((item) => !sitemap.has(item.url))) {
      throw new BulletinDiscoveryError(
        "A discovered source could not be verified in the Bulletin sitemap.",
      );
    }
    return discovery;
  } catch (error) {
    if (error instanceof BulletinDiscoveryError) throw error;
    throw new BulletinDiscoveryError(
      source.id === "nyu-shanghai"
        ? "Unable to fetch NYU Shanghai Bulletin indexes."
        : `Unable to fetch ${source.schoolName} Bulletin indexes.`,
    );
  }
}

export function discoverBulletinSources(
  fetcher: BulletinFetch,
): Promise<BulletinDiscovery> {
  return discoverBulletinSource(getCatalogSource("nyu-shanghai"), fetcher);
}
