import { describe, expect, it } from "vitest";
import { parseCandidateArgs } from "./regenerate-nyush-fallback";

describe("NYUSH candidate CLI", () => {
  it("requires an explicit output artifact", () => {
    expect(parseCandidateArgs(["--output=artifacts/nyu-shanghai-candidate.json"]).output).toBe("artifacts/nyu-shanghai-candidate.json");
    expect(parseCandidateArgs(["--help"]).help).toBe(true);
  });
});
