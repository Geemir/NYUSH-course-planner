import { describe, expect, it } from "vitest";
import { resolveAllocations } from "@/lib/allocation";
import {
  ACTIVE,
  COURSES_BY_ID,
  FIXTURE_PROGRAMS,
  PROGRAMS_BY_ID,
  SITE_NAMES,
  place,
} from "@/lib/fixtures.test-helper";
import { computeProgress } from "@/lib/progress";
import { buildRuleContext } from "@/lib/rules";
import { computeWarnings } from "@/lib/validation";
import {
  CatalogProgram,
  Course,
  FulfillmentFact,
  Placement,
  SemesterId,
  SpecialRule,
  courseCovers,
} from "@/lib/types";

function allocate(placements: Placement[], activePrograms = ACTIVE) {
  return resolveAllocations({
    placements,
    coursesById: COURSES_BY_ID,
    programsById: PROGRAMS_BY_ID,
    activePrograms,
  });
}

function warnings(
  placements: Placement[],
  studyAway: Partial<Record<SemesterId, string>> = {},
) {
  const { budget, doubleCounted } = allocate(placements);
  return computeWarnings({
    placements,
    studyAway,
    coursesById: COURSES_BY_ID,
    homeSiteId: "home",
    siteNameById: SITE_NAMES,
    budget,
    doubleCounted,
  });
}

function progress(placements: Placement[], completedSemesters: SemesterId[] = []) {
  const { effective } = allocate(placements);
  return computeProgress({
    placements,
    completedSemesters,
    coursesById: COURSES_BY_ID,
    programs: FIXTURE_PROGRAMS,
    effective,
  });
}

describe("allocation", () => {
  it("credits a non-cross-listed course to its single major", () => {
    const { effective } = allocate([place("A 1", "Y1F")]);
    expect(effective.get("A 1")).toEqual([
      { programId: "a", categoryId: "a-found" },
    ]);
  });

  it("auto-assigns a cross-listed course to the first major that still needs it", () => {
    // a-elect needs 1 course: first X goes to A, second spills to B.
    const { effective } = allocate([place("X 1", "Y1F"), place("X 2", "Y1S")]);
    expect(effective.get("X 1")).toEqual([
      { programId: "a", categoryId: "a-elect" },
    ]);
    expect(effective.get("X 2")).toEqual([
      { programId: "b", categoryId: "b-elect" },
    ]);
  });

  it("respects an explicit allocation to one major", () => {
    const { effective } = allocate([place("X 1", "Y1F", "b")]);
    expect(effective.get("X 1")).toEqual([
      { programId: "b", categoryId: "b-elect" },
    ]);
  });

  it("split counts toward both majors and consumes the budget", () => {
    const { effective, doubleCounted, budget } = allocate([
      place("X 1", "Y1F", "split"),
    ]);
    expect(effective.get("X 1")).toHaveLength(2);
    expect(doubleCounted).toEqual(["X 1"]);
    // Limit is the stricter of the two majors (A allows 1, B allows 2).
    expect(budget).toEqual({ limit: 1, used: 1 });
  });

  it("always passes core fulfillments through", () => {
    const { effective } = allocate([place("MATH 1", "Y1F")]);
    expect(effective.get("MATH 1")).toEqual([
      { programId: "core", categoryId: "core-math" },
    ]);
  });

  it("falls back to auto when the explicit major is inactive", () => {
    const { effective } = allocate([place("X 1", "Y1F", "b")], ["core", "a"]);
    expect(effective.get("X 1")).toEqual([
      { programId: "a", categoryId: "a-elect" },
    ]);
  });
});

describe("special rules", () => {
  const ctx = (rules: SpecialRule[], placements: Placement[]) =>
    buildRuleContext({ rules, placements, coursesById: COURSES_BY_ID });

  function warnWithRules(placements: Placement[], rules: SpecialRule[]) {
    return computeWarnings({
      placements,
      studyAway: {},
      coursesById: COURSES_BY_ID,
      homeSiteId: "home",
      siteNameById: SITE_NAMES,
      budget: null,
      doubleCounted: [],
      rules: ctx(rules, placements),
    });
  }

  it("grade-conditional concurrentPrereq relaxes a same-term prereq when the grade is met", () => {
    // A 2 requires A 1. Place both in the same term → normally a warning.
    const placements = [place("A 1", "Y1F"), place("A 2", "Y1F")];
    const rule: SpecialRule = {
      kind: "concurrentPrereq",
      id: "r1",
      course: "A 2",
      prereq: "A 1",
      condition: { course: "B 1", minGrade: "A" },
    };

    // Without the grade in B 1 → still warns.
    expect(warnWithRules(placements, [rule]).map((w) => w.kind)).toContain(
      "prereq-concurrent",
    );

    // With an A in B 1 → the rule permits the same-term placement, no warning.
    const withGrade: Placement[] = [
      ...placements,
      { courseId: "B 1", semesterId: "Y1F", allocation: "auto", expectedGrade: "A" },
    ];
    expect(
      warnWithRules(withGrade, [rule]).filter((w) =>
        w.kind.startsWith("prereq"),
      ),
    ).toHaveLength(0);
  });

  it("an unmet grade threshold does not relax the prereq", () => {
    const placements: Placement[] = [
      place("A 1", "Y1F"),
      place("A 2", "Y1F"),
      { courseId: "B 1", semesterId: "Y1F", allocation: "auto", expectedGrade: "B" },
    ];
    const rule: SpecialRule = {
      kind: "concurrentPrereq",
      id: "r1",
      course: "A 2",
      prereq: "A 1",
      condition: { course: "B 1", minGrade: "A" },
    };
    expect(warnWithRules(placements, [rule]).map((w) => w.kind)).toContain(
      "prereq-concurrent",
    );
  });

  it("an equivalence rule satisfies a prerequisite and a requirement slot", () => {
    // "ALT 1" is declared equivalent to "A 1" by a rule (not by the course).
    const alt = { ...COURSES_BY_ID.get("B 1")!, id: "ALT 1", fulfills: [] };
    const coursesById = new Map(COURSES_BY_ID);
    coursesById.set(alt.id, alt);
    const rule: SpecialRule = {
      kind: "equivalence",
      id: "e1",
      course: "ALT 1",
      target: "A 1",
    };
    const placements = [place("ALT 1", "Y1F"), place("A 2", "Y1S")];
    const ruleCtx = buildRuleContext({ rules: [rule], placements, coursesById });

    // A 2's prereq A 1 is satisfied by the equivalent ALT 1 in an earlier term.
    const w = computeWarnings({
      placements,
      studyAway: {},
      coursesById,
      homeSiteId: "home",
      siteNameById: SITE_NAMES,
      budget: null,
      doubleCounted: [],
      rules: ruleCtx,
    });
    expect(w.filter((x) => x.kind.startsWith("prereq"))).toHaveLength(0);

    // And ALT 1 fills A 1's slot in the a-found allOf category.
    const { effective } = resolveAllocations({
      placements,
      coursesById,
      programsById: PROGRAMS_BY_ID,
      activePrograms: ACTIVE,
    });
    const result = computeProgress({
      placements,
      completedSemesters: [],
      coursesById,
      programs: FIXTURE_PROGRAMS,
      effective,
      rules: ruleCtx,
    });
    const aFound = result.programs
      .find((p) => p.programId === "a")!
      .categories.find((c) => c.categoryId === "a-found")!;
    expect(aFound.matchedCourseIds).toContain("ALT 1");
    expect(aFound.plannedUnits).toBe(2);
  });

  it("no rules → behaves exactly as before (still warns on same-term prereq)", () => {
    const w = warnWithRules([place("A 1", "Y1F"), place("A 2", "Y1F")], []);
    expect(w.map((x) => x.kind)).toContain("prereq-concurrent");
  });
});

describe("legacy course robustness", () => {
  // Courses saved before `equivalentTo` existed are rehydrated from
  // localStorage without that field. Reading it must not crash.
  const legacy = {
    id: "LEGACY 1",
    title: "Legacy Course",
    credits: 4,
    department: "Test",
    prereqs: [["A 1"]],
    offered: ["fall", "spring"],
    sites: ["home"],
    fulfills: [],
    tags: [],
    // note: no `equivalentTo`
  } as unknown as Course;

  it("courseCovers tolerates a missing equivalentTo", () => {
    expect(courseCovers(legacy, "LEGACY 1")).toBe(true);
    expect(courseCovers(legacy, "A 1")).toBe(false);
  });

  it("computeWarnings does not throw on a legacy custom course", () => {
    const coursesById = new Map(COURSES_BY_ID);
    coursesById.set(legacy.id, legacy);
    expect(() =>
      computeWarnings({
        placements: [place("LEGACY 1", "Y1F"), place("A 2", "Y1S")],
        studyAway: {},
        coursesById,
        homeSiteId: "home",
        siteNameById: SITE_NAMES,
        budget: null,
        doubleCounted: [],
      }),
    ).not.toThrow();
  });
});

describe("validation", () => {
  it("uses selected credits for load warnings and ignores unknown offerings", () => {
    const variable = {
      ...COURSES_BY_ID.get("F 1")!,
      id: "VAR 1",
      credits: 4,
      minCredits: 1,
      maxCredits: 4,
      offered: [],
      offeringKnown: false,
    };
    const coursesById = new Map(COURSES_BY_ID);
    coursesById.set(variable.id, variable);
    const placements: Placement[] = [
      { courseId: variable.id, semesterId: "Y2S", allocation: "auto", selectedCredits: 1 },
      place("A 1", "Y2S"),
      place("A 2", "Y2S"),
      place("B 1", "Y2S"),
      place("X 1", "Y2S"),
    ];
    const result = computeWarnings({
      placements,
      studyAway: {},
      coursesById,
      homeSiteId: "home",
      siteNameById: SITE_NAMES,
      budget: null,
      doubleCounted: [],
    });

    expect(result.filter((warning) => warning.kind === "not-offered")).toHaveLength(0);
    expect(result.filter((warning) => warning.kind === "overload")).toHaveLength(0);
  });

  it("flags a missing prerequisite as an error", () => {
    const w = warnings([place("A 2", "Y1F")]);
    expect(w).toContainEqual(
      expect.objectContaining({ kind: "prereq-missing", severity: "error" }),
    );
  });

  it("flags a same-semester prerequisite as a warning", () => {
    const w = warnings([place("A 1", "Y1F"), place("A 2", "Y1F")]);
    expect(w.map((x) => x.kind)).toContain("prereq-concurrent");
    expect(w.map((x) => x.kind)).not.toContain("prereq-missing");
  });

  it("accepts a prerequisite in an earlier semester", () => {
    const w = warnings([place("A 1", "Y1F"), place("A 2", "Y1S")]);
    expect(w.filter((x) => x.kind.startsWith("prereq"))).toHaveLength(0);
  });

  it("satisfies an OR-group with any one option", () => {
    const w = warnings([place("B 1", "Y1F"), place("OR 1", "Y2F")]);
    expect(w.filter((x) => x.kind.startsWith("prereq"))).toHaveLength(0);
  });

  it("flags a fall-only course placed in spring", () => {
    const w = warnings([place("F 1", "Y1S")]);
    expect(w).toContainEqual(expect.objectContaining({ kind: "not-offered" }));
  });

  it("flags a course unavailable at the semester's study-away site", () => {
    const w = warnings([place("A 1", "Y3F")], { Y3F: "away" });
    expect(w).toContainEqual(
      expect.objectContaining({ kind: "site-unavailable", severity: "error" }),
    );
    const ok = warnings([place("AW 1", "Y3F")], { Y3F: "away" });
    expect(ok.filter((x) => x.kind === "site-unavailable")).toHaveLength(0);
  });

  it("flags overloaded and underloaded semesters", () => {
    const overloaded = warnings([
      place("A 1", "Y2F"),
      place("MATH 1", "Y2F"),
      place("B 1", "Y2F"),
      place("X 1", "Y2F"),
      place("AW 1", "Y2F"),
    ]); // 20 credits
    expect(overloaded).toContainEqual(
      expect.objectContaining({ kind: "overload", semesterId: "Y2F" }),
    );
    const underloaded = warnings([place("A 1", "Y1F")]); // 4 credits
    expect(underloaded).toContainEqual(
      expect.objectContaining({ kind: "underload", semesterId: "Y1F" }),
    );
  });

  it("flags a capstone before senior year", () => {
    const early = warnings([place("A 9", "Y2F")]);
    expect(early).toContainEqual(
      expect.objectContaining({ kind: "capstone-early" }),
    );
    const onTime = warnings([place("A 9", "Y4F")]);
    expect(onTime.filter((x) => x.kind === "capstone-early")).toHaveLength(0);
  });

  it("flags exceeding the double-count budget", () => {
    const w = warnings([place("X 1", "Y1F", "split"), place("X 2", "Y1S", "split")]);
    expect(w).toContainEqual(
      expect.objectContaining({ kind: "double-count-exceeded", severity: "error" }),
    );
  });
});

describe("progress", () => {
  it("applies a planned category override without losing calculated units", () => {
    const { effective } = allocate([]);
    const result = computeProgress({
      placements: [],
      completedSemesters: [],
      coursesById: COURSES_BY_ID,
      programs: FIXTURE_PROGRAMS,
      effective,
      requirementStatusOverrides: [
        { programId: "a", categoryId: "a-found", status: "planned" },
      ],
    });
    const category = result.programs
      .find((program) => program.programId === "a")!
      .categories.find((item) => item.categoryId === "a-found")!;

    expect(category).toMatchObject({
      calculatedPlannedUnits: 0,
      calculatedCompletedUnits: 0,
      plannedUnits: 2,
      completedUnits: 0,
      manualStatus: "planned",
    });
  });

  it("treats a completed category override as both completed and planned", () => {
    const { effective } = allocate([]);
    const result = computeProgress({
      placements: [],
      completedSemesters: [],
      coursesById: COURSES_BY_ID,
      programs: FIXTURE_PROGRAMS,
      effective,
      requirementStatusOverrides: [
        { programId: "a", categoryId: "a-found", status: "completed" },
      ],
    });
    const program = result.programs.find((item) => item.programId === "a")!;
    const category = program.categories.find((item) => item.categoryId === "a-found")!;

    expect(category).toMatchObject({ plannedUnits: 2, completedUnits: 2, manualStatus: "completed" });
    expect(program.plannedFraction).toBeGreaterThan(0);
    expect(program.completedFraction).toBeGreaterThan(0);
  });

  it("evaluates active Bulletin categories recursively with explicit manual facts", () => {
    const bulletinProgram = {
      id: "bulletin-major",
      name: "Bulletin Major",
      shortName: "BM",
      type: "major",
      auditAuthority: "nyush-bulletin",
      eligibleProfileRoles: ["primaryMajor", "secondMajor"],
      categories: [
        {
          id: "recursive",
          name: "Recursive requirement",
          requirement: {
            kind: "all",
            children: [
              { kind: "course", courseId: "A 1" },
              {
                kind: "manualConfirmation",
                label: "Advisor approval",
                sourceText: "Advisor approval is required.",
              },
            ],
          },
          sourceUrl: "https://bulletins.nyu.edu/undergraduate/shanghai/programs/test/",
          sourceTableId: "requirements",
          sourceRowIndexes: [0],
        },
      ],
      requirementRows: [],
      sourceRows: [],
      sourceReferenceIds: ["A 1"],
      provenance: {
        sourceUrl: "https://bulletins.nyu.edu/undergraduate/shanghai/programs/test/",
        snapshotId: "snapshot",
        sourceHash: "hash",
      },
    } as CatalogProgram;
    const facts: FulfillmentFact[] = [
      {
        id: "manual-1",
        kind: "manualConfirmation",
        requirementId: "Advisor approval is required.",
        label: "Approved",
      },
    ];
    const result = computeProgress({
      placements: [place("A 1", "Y1F")],
      completedSemesters: ["Y1F"],
      coursesById: COURSES_BY_ID,
      programs: [bulletinProgram],
      effective: new Map(),
      fulfillmentFacts: facts,
    });

    expect(result.programs[0]).toMatchObject({
      plannedFraction: 1,
      completedFraction: 1,
      categories: [
        expect.objectContaining({
          plannedUnits: 2,
          completedUnits: 2,
          manualState: "satisfied",
          gaps: [],
        }),
      ],
    });
  });

  it("uses selected variable credits for totals and credit-pool progress", () => {
    const variable = {
      ...COURSES_BY_ID.get("B 1")!,
      id: "VAR 1",
      credits: 4,
      minCredits: 1,
      maxCredits: 4,
      fulfills: [{ programId: "b", categoryId: "b-elect" }],
    };
    const coursesById = new Map(COURSES_BY_ID);
    coursesById.set(variable.id, variable);
    const placements: Placement[] = [
      { courseId: variable.id, semesterId: "Y1F", allocation: "auto", selectedCredits: 2 },
    ];
    const { effective } = resolveAllocations({
      placements,
      coursesById,
      programsById: PROGRAMS_BY_ID,
      activePrograms: ACTIVE,
    });
    const result = computeProgress({
      placements,
      completedSemesters: ["Y1F"],
      coursesById,
      programs: FIXTURE_PROGRAMS,
      effective,
    });
    const category = result.programs
      .find((program) => program.programId === "b")!
      .categories.find((item) => item.categoryId === "b-elect")!;

    expect(result.credits).toMatchObject({ planned: 2, completed: 2 });
    expect(category).toMatchObject({ plannedUnits: 2, completedUnits: 2 });
  });

  it("tracks allOf categories with completed vs planned units", () => {
    const result = progress(
      [place("A 1", "Y1F"), place("A 2", "Y2F")],
      ["Y1F"],
    );
    const aFound = result.programs
      .find((p) => p.programId === "a")!
      .categories.find((c) => c.categoryId === "a-found")!;
    expect(aFound.requiredUnits).toBe(2);
    expect(aFound.plannedUnits).toBe(2);
    expect(aFound.completedUnits).toBe(1);
    expect(aFound.missingCourseIds).toEqual([]);
  });

  it("reports missing courses for allOf categories", () => {
    const result = progress([place("A 1", "Y1F")]);
    const aFound = result.programs
      .find((p) => p.programId === "a")!
      .categories.find((c) => c.categoryId === "a-found")!;
    expect(aFound.missingCourseIds).toEqual(["A 2"]);
  });

  it("caps chooseN at N even when extra courses are allocated", () => {
    const result = progress([place("X 1", "Y1F", "a"), place("X 2", "Y1S", "a")]);
    const aElect = result.programs
      .find((p) => p.programId === "a")!
      .categories.find((c) => c.categoryId === "a-elect")!;
    expect(aElect.plannedUnits).toBe(1);
  });

  it("counts credits for creditsFrom categories", () => {
    const result = progress([place("B 1", "Y1F"), place("X 1", "Y1S", "b")]);
    const bElect = result.programs
      .find((p) => p.programId === "b")!
      .categories.find((c) => c.categoryId === "b-elect")!;
    expect(bElect.requiredUnits).toBe(8);
    expect(bElect.plannedUnits).toBe(8);
  });

  it("totals graduation credits across the plan", () => {
    const result = progress([place("A 1", "Y1F"), place("B 1", "Y1S")], ["Y1F"]);
    expect(result.credits.planned).toBe(8);
    expect(result.credits.completed).toBe(4);
    expect(result.credits.goal).toBe(128);
  });

  it("an explicitly single-allocated course does not advance the other major", () => {
    const result = progress([place("X 1", "Y1F", "a")]);
    const bElect = result.programs
      .find((p) => p.programId === "b")!
      .categories.find((c) => c.categoryId === "b-elect")!;
    expect(bElect.plannedUnits).toBe(0);
  });

  it("a custom course outside the rule list still fills pool categories via fulfills", () => {
    // Simulates an AI-imported course: credits b-elect but is not listed in
    // the b-elect rule's course pool.
    const custom = {
      ...COURSES_BY_ID.get("B 1")!,
      id: "NEW 1",
      fulfills: [{ programId: "b", categoryId: "b-elect" }],
    };
    const coursesById = new Map(COURSES_BY_ID);
    coursesById.set(custom.id, custom);
    const placements = [place("NEW 1", "Y1F")];
    const { effective } = resolveAllocations({
      placements,
      coursesById,
      programsById: PROGRAMS_BY_ID,
      activePrograms: ACTIVE,
    });
    const result = computeProgress({
      placements,
      completedSemesters: [],
      coursesById,
      programs: FIXTURE_PROGRAMS,
      effective,
    });
    const bElect = result.programs
      .find((p) => p.programId === "b")!
      .categories.find((c) => c.categoryId === "b-elect")!;
    expect(bElect.plannedUnits).toBe(4);
    // allOf categories are NOT satisfied by unlisted courses.
    const aFound = result.programs
      .find((p) => p.programId === "a")!
      .categories.find((c) => c.categoryId === "a-found")!;
    expect(aFound.plannedUnits).toBe(0);
  });

  it("an equivalent course satisfies allOf slots, pools, and prerequisites", () => {
    // "Honors A 1" stands in for "A 1" (like Honors Calculus ≡ Calculus).
    const honors = {
      ...COURSES_BY_ID.get("A 1")!,
      id: "HON 1",
      equivalentTo: ["A 1"],
      fulfills: [],
    };
    const coursesById = new Map(COURSES_BY_ID);
    coursesById.set(honors.id, honors);
    const placements = [place("HON 1", "Y1F"), place("A 2", "Y1S")];
    const { effective } = resolveAllocations({
      placements,
      coursesById,
      programsById: PROGRAMS_BY_ID,
      activePrograms: ACTIVE,
    });
    const result = computeProgress({
      placements,
      completedSemesters: ["Y1F"],
      coursesById,
      programs: FIXTURE_PROGRAMS,
      effective,
    });
    const aFound = result.programs
      .find((p) => p.programId === "a")!
      .categories.find((c) => c.categoryId === "a-found")!;
    // Both slots covered: A 1 via the honors equivalent, A 2 directly.
    expect(aFound.plannedUnits).toBe(2);
    expect(aFound.completedUnits).toBe(1);
    expect(aFound.missingCourseIds).toEqual([]);
    expect(aFound.matchedCourseIds).toContain("HON 1");

    // A 2 requires A 1 — the placed equivalent in an earlier term satisfies it.
    const w = computeWarnings({
      placements,
      studyAway: {},
      coursesById,
      homeSiteId: "home",
      siteNameById: SITE_NAMES,
      budget: null,
      doubleCounted: [],
    });
    expect(w.filter((x) => x.kind.startsWith("prereq"))).toHaveLength(0);
  });

  it("minor credit passes through alongside a chosen major (no allocation contest)", () => {
    // X 1 counts toward majors A and B (compete) and minor M (passes through).
    // With a CS+minor-style plan (one major A + minor M), X 1 should credit
    // both A's elective and M's elective from a single placement.
    const { effective, budget } = allocate([place("X 1", "Y1F")], [
      "core",
      "a",
      "m",
    ]);
    const fulfilled = effective.get("X 1")!.map((f) => `${f.programId}/${f.categoryId}`);
    expect(fulfilled).toContain("m/m-elect"); // minor pass-through
    expect(fulfilled).toContain("a/a-elect"); // sole active major
    expect(fulfilled).not.toContain("b/b-elect"); // B inactive
    // Only one active major → no double-count budget tension.
    expect(budget).toBeNull();
  });

  it("minor progress advances from shared courses", () => {
    const result = progress([place("X 1", "Y1F")], []);
    // m is inactive in the default ACTIVE list, so it won't appear unless
    // we pass programs including it; compute directly here.
    const { effective } = allocate([place("X 1", "Y1F")], ["core", "a", "m"]);
    const withMinor = computeProgress({
      placements: [place("X 1", "Y1F")],
      completedSemesters: [],
      coursesById: COURSES_BY_ID,
      programs: FIXTURE_PROGRAMS,
      effective,
    });
    const mElect = withMinor.programs
      .find((p) => p.programId === "m")!
      .categories.find((c) => c.categoryId === "m-elect")!;
    expect(mElect.plannedUnits).toBe(1);
    expect(result.credits.planned).toBe(4);
  });

  it("an equivalent of a pool member fills chooseN pools", () => {
    const alt = {
      ...COURSES_BY_ID.get("X 1")!,
      id: "ALT 1",
      fulfills: [],
      equivalentTo: ["X 1"],
    };
    const coursesById = new Map(COURSES_BY_ID);
    coursesById.set(alt.id, alt);
    const placements = [place("ALT 1", "Y1F")];
    const { effective } = resolveAllocations({
      placements,
      coursesById,
      programsById: PROGRAMS_BY_ID,
      activePrograms: ACTIVE,
    });
    const result = computeProgress({
      placements,
      completedSemesters: [],
      coursesById,
      programs: FIXTURE_PROGRAMS,
      effective,
    });
    const aElect = result.programs
      .find((p) => p.programId === "a")!
      .categories.find((c) => c.categoryId === "a-elect")!;
    expect(aElect.plannedUnits).toBe(1);
  });

  it("a split course advances both majors", () => {
    const result = progress([place("X 1", "Y1F", "split")]);
    const aElect = result.programs
      .find((p) => p.programId === "a")!
      .categories.find((c) => c.categoryId === "a-elect")!;
    const bElect = result.programs
      .find((p) => p.programId === "b")!
      .categories.find((c) => c.categoryId === "b-elect")!;
    expect(aElect.plannedUnits).toBe(1);
    expect(bElect.plannedUnits).toBe(4);
  });
});
