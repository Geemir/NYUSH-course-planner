import { describe, expect, it } from "vitest";
import {
  CATALOG_SOURCES,
  getCatalogSource,
} from "@/lib/bulletin/sourceRegistry";

const EXPECTED_SOURCE_IDS = [
  "nyu-shanghai",
  "nyu-new-york-arts-science",
  "nyu-new-york-dentistry",
  "nyu-new-york-individualized-study",
  "nyu-new-york-business",
  "nyu-new-york-liberal-studies",
  "nyu-new-york-public-service",
  "nyu-new-york-nursing",
  "nyu-new-york-global-public-health",
  "nyu-new-york-professional-studies",
  "nyu-new-york-social-work",
  "nyu-new-york-culture-education-human-development",
  "nyu-new-york-engineering",
  "nyu-new-york-arts",
] as const;

describe("Bulletin source registry", () => {
  it("contains Shanghai and exactly the 13 New York undergraduate sources", () => {
    expect(CATALOG_SOURCES.map((source) => source.id)).toEqual(
      EXPECTED_SOURCE_IDS,
    );
  });

  it("allows only Shanghai to emit program requirements", () => {
    expect(
      CATALOG_SOURCES.filter((source) => source.includePrograms).map(
        (source) => source.id,
      ),
    ).toEqual(["nyu-shanghai"]);
  });

  it("keeps every New York course index inside its undergraduate school root", () => {
    for (const source of CATALOG_SOURCES.filter(
      (candidate) => candidate.campus === "new-york",
    )) {
      expect(source.bulletinRoot).toMatch(
        /^https:\/\/bulletins\.nyu\.edu\/undergraduate\//,
      );
      expect(source.courseIndexUrl).toBe(`${source.bulletinRoot}courses/`);
    }
  });

  it("returns configured sources and rejects unknown ids", () => {
    expect(getCatalogSource("nyu-shanghai").schoolName).toBe("NYU Shanghai");
    expect(() => getCatalogSource("unknown-source")).toThrow(
      "Unknown catalog source",
    );
  });
});
