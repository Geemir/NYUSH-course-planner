import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { SITEMAP_URL } from "@/lib/bulletin/constants";
import { discoverBulletinSource } from "@/lib/bulletin/discover";
import { parseCoursePage } from "@/lib/bulletin/parseCoursePage";
import { classifyCourseLevel } from "@/lib/bulletin/classifyCourse";
import { normalizeBulletinSource } from "@/lib/bulletin/normalize";
import { CATALOG_SOURCES } from "@/lib/bulletin/sourceRegistry";

const ADAPTERS = [
  ["nyu-new-york-arts-science", "arts-science", "csci-ua", "CSCI-UA 101"],
  ["nyu-new-york-dentistry", "dentistry", "dent-ua", "DENT-UA 100"],
  ["nyu-new-york-individualized-study", "individualized-study", "idsem-ug", "IDSEM-UG 1001"],
  ["nyu-new-york-business", "business", "acct-ub", "ACCT-UB 1"],
  ["nyu-new-york-liberal-studies", "liberal-studies", "gls-ua", "GLS-UA 101"],
  ["nyu-new-york-public-service", "public-service", "upadm-gp", "UPADM-GP 101"],
  ["nyu-new-york-nursing", "nursing", "nurse-un", "NURSE-UN 100"],
  ["nyu-new-york-global-public-health", "global-public-health", "ugph-gu", "UGPH-GU 10"],
  ["nyu-new-york-professional-studies", "professional-studies", "sps-ug", "SPS-UG 101"],
  ["nyu-new-york-social-work", "social-work", "undsw-us", "UNDSW-US 1"],
  [
    "nyu-new-york-culture-education-human-development",
    "culture-education-human-development",
    "mcc-ue",
    "MCC-UE 1",
  ],
  ["nyu-new-york-engineering", "engineering", "cs-uy", "CS-UY 1114"],
  ["nyu-new-york-arts", "arts", "drlit-ua", "DRLIT-UA 10"],
] as const;

function fixture(directory: string, name: string) {
  return readFileSync(
    fileURLToPath(
      new URL(`./__fixtures__/new-york/${directory}/${name}`, import.meta.url),
    ),
    "utf8",
  );
}

describe("New York school adapter matrix", () => {
  it("covers every configured New York source exactly once", () => {
    expect(ADAPTERS.map(([sourceId]) => sourceId)).toEqual(
      CATALOG_SOURCES.filter((source) => source.campus === "new-york").map(
        (source) => source.id,
      ),
    );
  });

  it.each(ADAPTERS)(
    "discovers, parses, classifies, and normalizes %s",
    async (sourceId, directory, slug, code) => {
      const source = CATALOG_SOURCES.find((entry) => entry.id === sourceId)!;
      const pageUrl = `${source.courseIndexUrl}${slug}/`;
      const pages = new Map([
        [source.courseIndexUrl, fixture(directory, "course-index.html")],
        [SITEMAP_URL, `<urlset><url><loc>${pageUrl}</loc></url></urlset>`],
      ]);
      const discovery = await discoverBulletinSource(
        source,
        vi.fn(async (url: string) => pages.get(url) ?? ""),
      );
      const document = parseCoursePage({
        source,
        sourceUrl: pageUrl,
        html: fixture(directory, "subject-page.html"),
      });
      const parsedCourse = document.courses[0];
      const candidate = normalizeBulletinSource(discovery, [document]);

      expect(discovery.programUrls).toEqual([]);
      expect(discovery.coursePageUrls).toEqual([pageUrl]);
      expect(parsedCourse).toMatchObject({
        sourceId,
        schoolName: source.schoolName,
        campus: "new-york",
        code,
      });
      expect(parsedCourse.creditText).toMatch(/Credits$/);
      expect(parsedCourse.description).not.toBe("");
      expect(classifyCourseLevel(parsedCourse).level).toBe("undergraduate");
      expect(candidate.programs).toEqual([]);
      expect(candidate.courses[0]).toMatchObject({
        stableId: `${sourceId}:${code}`,
        sourceId,
        level: "undergraduate",
        course: {
          id: code,
          sites: ["new-york"],
          offeringKnown: false,
          fulfills: [],
        },
      });
      expect(candidate.courses[0].course.minCredits).toBeGreaterThan(0);
      expect(candidate.courses[0].course.maxCredits).toBeGreaterThanOrEqual(
        candidate.courses[0].course.minCredits ?? 0,
      );
    },
  );
});
