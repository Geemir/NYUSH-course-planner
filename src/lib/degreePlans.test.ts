import { afterEach, describe, expect, it } from "vitest";
import {
  CUSTOM_PLAN_ID,
  degreeOptionsFromPrograms,
  matchDegreePlan,
  reconcileProgramSelection,
} from "@/lib/degreePlans";
import type { PlannerProgram } from "@/lib/requirements";
import { usePlannerStore } from "@/store/plannerStore";

function program(
  id: string,
  name: string,
  type: "core" | "major" | "minor",
): PlannerProgram {
  return {
    id,
    name,
    shortName: name,
    type,
    color: "#57068c",
    categories: [
      {
        id: "requirements",
        name: "Requirements",
        isCapstone: false,
        rule: { kind: "allOf", courses: [`${id.toUpperCase()} 101`] },
      },
    ],
  };
}

const CORE = program("core", "NYUSH Core Curriculum", "core");
const CS = program("cs", "Computer Science (BS)", "major");
const HUMANITIES = program("humanities", "Humanities (BA)", "major");
const WRITING = program("writing-minor", "Creative Writing (Minor)", "minor");

describe("dynamic degree plans", () => {
  afterEach(() => usePlannerStore.getState().reset());

  it("creates one option for every imported major", () => {
    expect(degreeOptionsFromPrograms([CORE, CS, HUMANITIES, WRITING])).toEqual([
      {
        id: "cs",
        label: "Computer Science (BS)",
        programs: ["core", "cs"],
      },
      {
        id: "humanities",
        label: "Humanities (BA)",
        programs: ["core", "humanities"],
      },
    ]);
  });

  it("labels an active double major as custom without changing its programs", () => {
    const activePrograms = ["core", "cs", "humanities"];
    const original = [...activePrograms];
    const options = degreeOptionsFromPrograms([CORE, CS, HUMANITIES]);

    expect(matchDegreePlan(activePrograms, options)).toBe(CUSTOM_PLAN_ID);
    expect(activePrograms).toEqual(original);
  });

  it("preserves a valid custom selection while removing retired programs", () => {
    expect(
      reconcileProgramSelection(
        ["core", "cs", "humanities", "retired-major"],
        ["core", "cs", "humanities", "writing-minor"],
        ["core", "cs"],
      ),
    ).toEqual(["core", "cs", "humanities"]);
  });

  it("falls back to Core and the first major when no active major remains", () => {
    expect(
      reconcileProgramSelection(
        ["core", "retired-major"],
        ["core", "cs", "humanities", "writing-minor"],
        ["core", "cs"],
      ),
    ).toEqual(["core", "cs"]);
  });

  it("reconciles persisted active programs through the planner store", () => {
    usePlannerStore.setState({
      activePrograms: ["core", "humanities", "retired-major"],
    });
    usePlannerStore.getState().reconcilePrograms(
      ["core", "cs", "humanities", "writing-minor"],
      ["core", "cs"],
    );

    expect(usePlannerStore.getState().activePrograms).toEqual([
      "core",
      "humanities",
    ]);
  });
});
