import { describe, expect, it } from "vitest";
import {
  canonicalCourseCode,
  catalogCourseStableId,
} from "@/lib/catalog/identity";

describe("catalog course identity", () => {
  it("normalizes whitespace and case in official codes", () => {
    expect(canonicalCourseCode("  csci-ua   101 ")).toBe("CSCI-UA 101");
  });

  it("keeps identical official codes distinct across sources", () => {
    expect(
      catalogCourseStableId(
        "nyu-new-york-arts-science",
        "CSCI-UA 101",
      ),
    ).not.toBe(
      catalogCourseStableId("nyu-new-york-engineering", "CSCI-UA 101"),
    );
  });

  it("rejects source ids outside the registry slug format", () => {
    expect(() => catalogCourseStableId("NYU/Unsafe", "CSCI-UA 101")).toThrow(
      "Invalid catalog source ID",
    );
  });
});
