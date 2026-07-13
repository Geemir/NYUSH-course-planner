import { describe, expect, it } from "vitest";
import {
  extractCourseCodes,
  normalizeAlbertCourse,
  parseCredits,
  sanitizePrereqMap,
} from "@/lib/albertNormalize";

const siteIdByName = new Map([
  ["shanghai", "shanghai"],
  ["new york", "newyork"],
  ["abu dhabi", "abudhabi"],
]);

describe("parseCredits", () => {
  it("parses the first number from hours_html", () => {
    expect(parseCredits("4 Hour Lecture")).toBe(4);
    expect(parseCredits("2 Hour Lecture / 0 Hour Lab")).toBe(2);
    expect(parseCredits(undefined)).toBe(4);
    expect(parseCredits("nonsense")).toBe(4);
  });
});

describe("extractCourseCodes", () => {
  it("pulls course codes out of restriction text and dedupes", () => {
    const text =
      "Prerequisite: CSCI-SHU 101 and MATH-SHU 140. Also CSCI-SHU 101.";
    expect(extractCourseCodes(text)).toEqual(["CSCI-SHU 101", "MATH-SHU 140"]);
  });
  it("returns [] when there are no codes", () => {
    expect(extractCourseCodes("Instructor consent required.")).toEqual([]);
  });
});

describe("normalizeAlbertCourse", () => {
  it("maps a Shanghai fall course with a prereq", () => {
    const course = normalizeAlbertCourse(
      {
        details: {
          code: "DATS-SHU 301",
          title: "Causal Inference",
          hours_html: "4 Hour Lecture",
          campus_location: "Shanghai",
          registration_restrictions: "Prerequisite: MATH-SHU 235.",
          start_date: "2026-08-31",
          description: "<p>Covers <b>causal</b> methods.</p>",
        },
        campuses: ["Shanghai"],
      },
      siteIdByName,
    )!;
    expect(course.id).toBe("DATS-SHU 301");
    expect(course.credits).toBe(4);
    expect(course.sites).toEqual(["shanghai"]);
    expect(course.offered).toEqual(["fall"]);
    expect(course.prereqs).toEqual([["MATH-SHU 235"]]);
    expect(course.department).toBe("Data Science");
    expect(course.description).toBe("Covers causal methods.");
  });

  it("unions campuses across sections into sites", () => {
    const course = normalizeAlbertCourse(
      {
        details: {
          code: "CSCI-SHU 210",
          title: "Data Structures",
          hours_html: "4 Hour Lecture",
          start_date: "2027-01-20",
        },
        campuses: ["Shanghai", "New York"],
      },
      siteIdByName,
    )!;
    expect(course.sites.sort()).toEqual(["newyork", "shanghai"]);
    expect(course.offered).toEqual(["spring"]); // January start
  });

  it("tags capstones and defaults sites to shanghai when unknown", () => {
    const course = normalizeAlbertCourse(
      {
        details: {
          code: "CSCI-SHU 420",
          title: "CS Senior Project (Capstone)",
          hours_html: "4 Hour Lecture",
          campus_location: "Mars",
        },
        campuses: ["Mars"],
      },
      siteIdByName,
    )!;
    expect(course.tags).toContain("capstone");
    expect(course.sites).toEqual(["shanghai"]);
  });

  it("returns null when code/title are missing", () => {
    expect(
      normalizeAlbertCourse(
        { details: { code: "", title: "x" }, campuses: [] },
        siteIdByName,
      ),
    ).toBeNull();
  });
});

describe("sanitizePrereqMap", () => {
  it("parses a {prereqs:{CODE:[[...]]}} response into a map", () => {
    const m = sanitizePrereqMap({
      prereqs: {
        "CSCI-SHU 210": [["CSCI-SHU 101", "CSCI-SHU 11"]],
        "CSCI-SHU 220": [["CSCI-SHU 210"], ["CSCI-SHU 2314"]],
      },
    });
    expect(m.get("CSCI-SHU 210")).toEqual([["CSCI-SHU 101", "CSCI-SHU 11"]]);
    expect(m.get("CSCI-SHU 220")).toEqual([
      ["CSCI-SHU 210"],
      ["CSCI-SHU 2314"],
    ]);
  });

  it("accepts a bare map and drops non-code / empty entries", () => {
    const m = sanitizePrereqMap({
      "CSCI-SHU 210": [["CSCI-SHU 101"], ["instructor consent"]],
      "not a code": [["CSCI-SHU 101"]],
      "MATH-SHU 140": [],
    });
    expect(m.get("CSCI-SHU 210")).toEqual([["CSCI-SHU 101"]]);
    expect(m.has("not a code")).toBe(false);
    expect(m.has("MATH-SHU 140")).toBe(false);
  });

  it("returns an empty map for junk input", () => {
    expect(sanitizePrereqMap(null).size).toBe(0);
    expect(sanitizePrereqMap("nope").size).toBe(0);
  });
});
