import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BulletinParseError,
  parseCoursePage,
} from "@/lib/bulletin/parseCoursePage";
import type { BulletinSubjectSource } from "@/lib/bulletin/sourceTypes";

const COURSE_PAGE = readFileSync(
  fileURLToPath(new URL("./__fixtures__/course-page.html", import.meta.url)),
  "utf8",
);

const META: BulletinSubjectSource = {
  kind: "subject",
  slug: "csci-shu",
  title: "Computer Science (CSCI-SHU)",
  url: "https://bulletins.nyu.edu/undergraduate/shanghai/courses/csci-shu/",
};

describe("parseCoursePage", () => {
  it("preserves course fields, linked prerequisites, attributes, and plain text", () => {
    const page = parseCoursePage(COURSE_PAGE, META);

    expect(page).toMatchObject({
      kind: "subject",
      slug: "csci-shu",
      title: "Computer Science (CSCI-SHU)",
      sourceUrl:
        "https://bulletins.nyu.edu/undergraduate/shanghai/courses/csci-shu/",
    });
    expect(page.courses).toHaveLength(3);
    expect(page.courses[0]).toMatchObject({
      code: "CSCI-SHU 101",
      title: "Introduction to Computer Science",
      creditsText: "4 Credits",
      description:
        "Students learn computational thinking, program design, and problem solving.",
      offeringText: "Fall and Spring",
      prerequisiteText:
        "CSCI-SHU 11 Introduction to Computer Programming or placement exam.",
      linkedCourseIds: ["CSCI-SHU 11"],
      attributes: ["Algorithmic Thinking", "Computer Science Required"],
      detailTexts: [
        "Prerequisite(s): CSCI-SHU 11 Introduction to Computer Programming or placement exam.",
        "Offered: Fall and Spring",
        "Course Attributes: Algorithmic Thinking; Computer Science Required",
      ],
    });
    expect(page.courses.map((course) => course.code)).not.toContain(
      "DECOY-SHU 1",
    );
  });

  it("preserves variable credit and occasional offering text", () => {
    const course = parseCoursePage(COURSE_PAGE, META).courses[1];

    expect(course).toMatchObject({
      code: "CSCI-SHU 205",
      creditsText: "2-4 Credits",
      description:
        "Content varies by instructor and topic. Students examine examples. Seminar discussion. Independent work.",
      offeringText: "Occasionally",
    });
  });

  it("keeps absent optional fields unknown instead of inventing values", () => {
    const course = parseCoursePage(COURSE_PAGE, META).courses[2];

    expect(course).toEqual({
      code: "CSCI-SHU 399",
      title: "Independent Study",
      description: "Faculty-supervised independent work.",
      linkedCourseIds: [],
      attributes: [],
      detailTexts: [],
    });
  });

  it("rejects duplicate course codes", () => {
    const duplicate = COURSE_PAGE.replace("CSCI-SHU 205", "CSCI-SHU 101");

    expect(() => parseCoursePage(duplicate, META)).toThrowError(
      new BulletinParseError("Duplicate Bulletin course code: CSCI-SHU 101."),
    );
  });

  it("rejects duplicate course titles", () => {
    const duplicate = COURSE_PAGE.replace(
      "Topics in Computer Science",
      "Introduction to Computer Science",
    );

    expect(() => parseCoursePage(duplicate, META)).toThrowError(
      new BulletinParseError(
        "Duplicate Bulletin course title: Introduction to Computer Science.",
      ),
    );
  });

  it("rejects a course block with a missing code", () => {
    const missingCode = COURSE_PAGE.replace(
      '<span class="courseblockcode">CSCI-SHU&nbsp;101</span>',
      "",
    );

    expect(() => parseCoursePage(missingCode, META)).toThrowError(
      new BulletinParseError("A Bulletin course block is missing its code."),
    );
  });

  it("rejects a course block with a missing title", () => {
    const missingTitle = COURSE_PAGE.replace(
      "Introduction to Computer Science",
      "",
    );

    expect(() => parseCoursePage(missingTitle, META)).toThrowError(
      new BulletinParseError("Bulletin course CSCI-SHU 101 is missing its title."),
    );
  });

  it("rejects a page whose heading does not match the Shanghai subject metadata", () => {
    const wrongSubject = COURSE_PAGE.replace(
      "<h1>Computer Science (CSCI-SHU)</h1>",
      "<h1>Mathematics (MATH-SHU)</h1>",
    );

    expect(() => parseCoursePage(wrongSubject, META)).toThrowError(
      BulletinParseError,
    );
    expect(() => parseCoursePage(wrongSubject, META)).toThrow(
      "Shanghai subject page identity could not be verified",
    );
  });

  it("rejects a page without Shanghai identity in its breadcrumb", () => {
    const wrongCampus = COURSE_PAGE.replace(
      '<a href="/undergraduate/shanghai/">NYU Shanghai</a>',
      '<a href="/undergraduate/new-york/">New York</a>',
    );

    expect(() => parseCoursePage(wrongCampus, META)).toThrow(
      "Shanghai subject page identity could not be verified",
    );
  });

  it("rejects metadata outside the canonical Shanghai subject path", () => {
    const wrongMeta = {
      ...META,
      url: "https://bulletins.nyu.edu/undergraduate/new-york/courses/csci-ua/",
    };

    expect(() => parseCoursePage(COURSE_PAGE, wrongMeta)).toThrowError(
      BulletinParseError,
    );
  });

  it("rejects a subject page without course blocks", () => {
    const emptyPage = COURSE_PAGE.replace(
      /<div class="courseblock">[\s\S]*?<\/div>\s*(?=<div class="courseblock">|<aside>)/g,
      "",
    );

    expect(() => parseCoursePage(emptyPage, META)).toThrow(
      "did not contain any course blocks",
    );
  });
});
