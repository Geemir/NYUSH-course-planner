import { describe, expect, it } from "vitest";
import { splitListings } from "@/lib/listings";

const oneListing = `CSCI-SHU 350 Deep Learning
Covers neural networks and backprop. Pre-requisites: CSCI-SHU 360.
Term: Spring 2026
CSCI-SHU 350 | 4 units
Course Location: Shanghai`;

describe("splitListings", () => {
  it("keeps a single listing as one chunk despite the repeated code line", () => {
    // The "CSCI-SHU 350 | 4 units" line must NOT start a second chunk.
    expect(splitListings(oneListing)).toHaveLength(1);
  });

  it("splits explicitly on a --- separator", () => {
    const text = `${oneListing}\n---\nMATH-SHU 235 Probability\nStats course. 4 units at Shanghai campus here.`;
    expect(splitListings(text)).toHaveLength(2);
  });

  it("splits back-to-back listings at title headers", () => {
    const text = `${oneListing}\nCSCI-SHU 213 Databases\nRelational databases and SQL, indexing, transactions. 4 units.`;
    const chunks = splitListings(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain("Deep Learning");
    expect(chunks[1]).toContain("Databases");
  });

  it("drops short fragments and empty input", () => {
    expect(splitListings("")).toEqual([]);
    expect(splitListings("   \n  ")).toEqual([]);
  });
});
