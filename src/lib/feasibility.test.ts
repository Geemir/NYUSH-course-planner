import { describe, expect, it } from "vitest";
import { resolveAllocations } from "@/lib/allocation";
import { analyzeFeasibility } from "@/lib/feasibility";
import { computeProgress } from "@/lib/progress";
import {
  CatalogProgram,
  Course,
  FulfillmentFact,
  Placement,
  Program,
  SemesterId,
  semesterYear,
} from "@/lib/types";

function course(id: string, extra: Partial<Course> = {}): Course {
  return {
    id,
    title: id,
    credits: 4,
    department: "Test",
    prereqs: [],
    offered: ["fall", "spring"],
    sites: ["home"],
    fulfills: [],
    equivalentTo: [],
    tags: [],
    ...extra,
  };
}

/** Builds a one-major program whose only category is an allOf of `ids`. */
function allOfProgram(ids: string[], categoryId = "p-all"): Program {
  return {
    id: "p",
    name: "P",
    shortName: "P",
    type: "major",
    color: "#000",
    categories: [
      { id: categoryId, name: "Req", isCapstone: false, rule: { kind: "allOf", courses: ids } },
    ],
  };
}

function fulfill(ids: string[], categoryId = "p-all"): Course[] {
  return ids.map((id) =>
    course(id, { fulfills: [{ programId: "p", categoryId }] }),
  );
}

function analyze(
  programInput: Program | CatalogProgram | Array<Program | CatalogProgram>,
  courses: Course[],
  placements: Placement[] = [],
  completed: SemesterId[] = [],
  studyAway: Partial<Record<SemesterId, string>> = {},
  fulfillmentFacts: FulfillmentFact[] = [],
) {
  const programs = Array.isArray(programInput) ? programInput : [programInput];
  const coursesById = new Map(courses.map((c) => [c.id, c]));
  const programsById = new Map(programs.map((p) => [p.id, p]));
  const { effective } = resolveAllocations({
    placements,
    coursesById,
    programsById,
    activePrograms: programs.map((p) => p.id),
  });
  const progress = computeProgress({
    placements,
    completedSemesters: completed,
    coursesById,
    programs,
    effective,
    fulfillmentFacts,
  });
  return analyzeFeasibility({
    programs,
    progressByProgram: new Map(progress.programs.map((p) => [p.programId, p])),
    placements,
    completedSemesters: completed,
    studyAway,
    coursesById,
    homeSiteId: "home",
  });
}

const ALL8: SemesterId[] = ["Y1F", "Y1S", "Y2F", "Y2S", "Y3F", "Y3S", "Y4F", "Y4S"];

describe("feasibility analyzer", () => {
  it("reports ambiguous Bulletin choices without inventing a course", () => {
    const program = {
      id: "p",
      name: "P",
      shortName: "P",
      type: "major",
      categories: [
        {
          id: "choice",
          name: "Choice",
          requirement: {
            kind: "any",
            children: [
              { kind: "course", courseId: "c0" },
              { kind: "course", courseId: "c1" },
            ],
          },
          sourceUrl: "https://bulletins.nyu.edu/undergraduate/shanghai/programs/p/",
          sourceTableId: "requirements",
          sourceRowIndexes: [0],
        },
      ],
      requirementRows: [],
      sourceRows: [],
      sourceReferenceIds: ["c0", "c1"],
      provenance: {
        sourceUrl: "https://bulletins.nyu.edu/undergraduate/shanghai/programs/p/",
        snapshotId: "snapshot",
        sourceHash: "hash",
      },
    } as CatalogProgram;

    const result = analyze(program, [course("c0"), course("c1")]);
    expect(result.suggestion).toEqual([]);
    expect(result.unplaceable).toEqual([]);
    expect(result.requirementGaps).toEqual([
      expect.objectContaining({ kind: "ambiguous", candidateCourseIds: ["c0", "c1"] }),
    ]);
  });

  it("reports manual gaps separately and completes them only from explicit facts", () => {
    const program = {
      id: "p",
      name: "P",
      shortName: "P",
      type: "major",
      categories: [
        {
          id: "manual",
          name: "Manual",
          requirement: {
            kind: "manualConfirmation",
            label: "Director approval",
            sourceText: "The director must approve this plan.",
          },
          sourceUrl: "https://bulletins.nyu.edu/undergraduate/shanghai/programs/p/",
          sourceTableId: "requirements",
          sourceRowIndexes: [0],
        },
      ],
      requirementRows: [],
      sourceRows: [],
      sourceReferenceIds: [],
      provenance: {
        sourceUrl: "https://bulletins.nyu.edu/undergraduate/shanghai/programs/p/",
        snapshotId: "snapshot",
        sourceHash: "hash",
      },
    } as CatalogProgram;

    const pending = analyze(program, []);
    expect(pending.suggestion).toEqual([]);
    expect(pending.requirementGaps).toEqual([
      expect.objectContaining({ kind: "manual", label: "Director approval" }),
    ]);

    const confirmed = analyze(program, [], [], [], {}, [
      {
        id: "fact",
        kind: "manualConfirmation",
        requirementId: "The director must approve this plan.",
        label: "Approved",
      },
    ]);
    expect(confirmed.status).toBe("complete");
    expect(confirmed.requirementGaps).toEqual([]);
  });

  it("does not reject an unknown offering pattern as not offered", () => {
    const unknown = course("c0", { offered: [], offeringKnown: false });
    const result = analyze(allOfProgram(["c0"]), [
      { ...unknown, fulfills: [{ programId: "p", categoryId: "p-all" }] },
    ]);
    expect(result.suggestion).toHaveLength(1);
    expect(result.unplaceable).toEqual([]);
  });

  it("reports 'complete' when requirements are already satisfied", () => {
    const r = analyze(allOfProgram(["c0"]), fulfill(["c0"]), [
      { courseId: "c0", semesterId: "Y1F", allocation: "auto" },
    ]);
    expect(r.status).toBe("complete");
    expect(r.suggestion).toHaveLength(0);
  });

  it("schedules an empty plan and reports 'feasible'", () => {
    const r = analyze(allOfProgram(["c0", "c1", "c2"]), fulfill(["c0", "c1", "c2"]));
    expect(r.status).toBe("feasible");
    expect(r.suggestion).toHaveLength(3);
    expect(r.unplaceable).toHaveLength(0);
  });

  it("respects prerequisite order in the suggested schedule", () => {
    const courses = fulfill(["c0", "c1", "c2"]);
    courses[1].prereqs = [["c0"]];
    courses[2].prereqs = [["c1"]];
    const r = analyze(allOfProgram(["c0", "c1", "c2"]), courses);
    const term = (id: string) =>
      r.suggestion.find((s) => s.courseId === id)!.semesterId;
    const idx = (s: SemesterId) => ALL8.indexOf(s);
    expect(idx(term("c0"))).toBeLessThan(idx(term("c1")));
    expect(idx(term("c1"))).toBeLessThan(idx(term("c2")));
  });

  it("places a capstone in the senior year", () => {
    const courses = fulfill(["cap"]);
    courses[0].tags = ["capstone"];
    const r = analyze(allOfProgram(["cap"]), courses);
    expect(r.status).toBe("feasible");
    expect(semesterYear(r.suggestion[0].semesterId)).toBe(4);
  });

  it("flags overload when requirements only fit by exceeding 18 credits", () => {
    // 9 four-credit courses, only Y4F + Y4S open → cap fits 8, 9th overloads.
    const ids = Array.from({ length: 9 }, (_, i) => `o${i}`);
    const completed: SemesterId[] = ["Y1F", "Y1S", "Y2F", "Y2S", "Y3F", "Y3S"];
    const r = analyze(allOfProgram(ids), fulfill(ids), [], completed);
    expect(r.status).toBe("feasible-with-overload");
    expect(r.overloadedTerms.length).toBeGreaterThan(0);
    expect(r.unplaceable).toHaveLength(0);
  });

  it("reports 'infeasible' when a prerequisite chain can't fit", () => {
    // Chain c0→c1→c2→c3→c4 needs 5 terms, but only Y4F + Y4S are open.
    const ids = ["c0", "c1", "c2", "c3", "c4"];
    const courses = fulfill(ids);
    for (let i = 1; i < ids.length; i++) courses[i].prereqs = [[ids[i - 1]]];
    const completed: SemesterId[] = ["Y1F", "Y1S", "Y2F", "Y2S", "Y3F", "Y3S"];
    const r = analyze(allOfProgram(ids), courses, [], completed);
    expect(r.status).toBe("infeasible");
    expect(r.unplaceable.length).toBeGreaterThan(0);
    expect(r.unplaceable[0].reason).toBeTruthy();
  });

  it("pulls prerequisites that aren't themselves required into the suggestion", () => {
    // Requirement is just c1, but c1 needs c0 (not a requirement) → c0 added.
    const c0 = course("c0");
    const c1 = course("c1", {
      prereqs: [["c0"]],
      fulfills: [{ programId: "p", categoryId: "p-all" }],
    });
    const r = analyze(allOfProgram(["c1"]), [c0, c1]);
    expect(r.status).toBe("feasible");
    expect(r.suggestion.map((s) => s.courseId).sort()).toEqual(["c0", "c1"]);
  });
});
