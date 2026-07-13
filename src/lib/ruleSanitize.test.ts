import { describe, expect, it } from "vitest";
import { RuleParseError, sanitizeRule } from "@/lib/ruleSanitize";
import { Course } from "@/lib/types";

const mk = (id: string, title: string): Course => ({
  id,
  title,
  credits: 4,
  department: "Test",
  prereqs: [],
  offered: ["fall", "spring"],
  sites: ["shanghai"],
  fulfills: [],
  equivalentTo: [],
  tags: [],
});

const courses = [
  mk("CSCI-SHU 11", "Introduction to Computer Programming"),
  mk("CSCI-SHU 101", "Introduction to Computer Science"),
  mk("CSCI-SHU 210", "Data Structures"),
  mk("MATH-SHU 131", "Calculus"),
];

describe("sanitizeRule", () => {
  it("builds a grade-conditional concurrentPrereq rule with an id", () => {
    const { rule, issues } = sanitizeRule(
      {
        kind: "concurrentPrereq",
        course: "CSCI-SHU 210",
        prereq: "CSCI-SHU 101",
        condition: { course: "CSCI-SHU 11", minGrade: "A" },
        explanation: "x",
      },
      courses,
    );
    expect(rule.kind).toBe("concurrentPrereq");
    expect(rule.id).toBeTruthy();
    if (rule.kind === "concurrentPrereq") {
      expect(rule.course).toBe("CSCI-SHU 210");
      expect(rule.prereq).toBe("CSCI-SHU 101");
      expect(rule.condition).toEqual({ course: "CSCI-SHU 11", minGrade: "A" });
    }
    expect(issues).toEqual([]);
  });

  it("builds an equivalence rule", () => {
    const { rule } = sanitizeRule(
      { kind: "equivalence", course: "MATH-SHU 131", target: "CSCI-SHU 210" },
      courses,
    );
    expect(rule.kind).toBe("equivalence");
  });

  it("flags unknown course codes as non-fatal issues", () => {
    const { rule, issues } = sanitizeRule(
      { kind: "equivalence", course: "MATH-SHU 999", target: "CSCI-SHU 210" },
      courses,
    );
    expect(rule.kind).toBe("equivalence");
    expect(issues.some((i) => i.includes("MATH-SHU 999"))).toBe(true);
  });

  it("drops an invalid grade condition (keeps an unconditional rule)", () => {
    const { rule } = sanitizeRule(
      {
        kind: "concurrentPrereq",
        course: "CSCI-SHU 210",
        prereq: "CSCI-SHU 101",
        condition: { course: "CSCI-SHU 11", minGrade: "Z" }, // invalid grade
      },
      courses,
    );
    if (rule.kind === "concurrentPrereq") {
      expect(rule.condition).toBeUndefined();
    }
  });

  it("throws on an unknown rule kind", () => {
    expect(() =>
      sanitizeRule({ kind: "unknown", explanation: "nope" }, courses),
    ).toThrow(RuleParseError);
  });

  it("throws when required courses are missing", () => {
    expect(() =>
      sanitizeRule({ kind: "concurrentPrereq", course: "CSCI-SHU 210" }, courses),
    ).toThrow(RuleParseError);
  });
});
