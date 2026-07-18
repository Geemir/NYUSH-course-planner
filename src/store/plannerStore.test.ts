import { beforeEach, describe, expect, it } from "vitest";
import { createHistory } from "@/store/planHistory";
import {
  usePlannerStore,
  plannerPersistedState,
  type PlannerPresent,
} from "@/store/plannerStore";

const initial: PlannerPresent = {
  placements: [], studyAway: {}, completedSemesters: [],
  activePrograms: ["core", "cs"],
  programProfile: { coreProgramId: "core", primaryMajorId: "cs", secondMajorId: null, minorIds: [] },
  unresolvedProgramIds: [],
  customCourses: [], fulfillmentFacts: [], dismissedWarnings: [], startYear: 2025,
};

function resetState() {
  usePlannerStore.setState({
    ...structuredClone(initial),
    history: createHistory(initial),
    canUndo: false, canRedo: false, undoLabel: null, redoLabel: null,
  });
}

describe("planner semantic history", () => {
  beforeEach(resetState);

  it("records one labeled entry for course and profile mutations", () => {
    const store = () => usePlannerStore.getState();
    store().placeCourse("TEST 1", "Y1F");
    expect(store().history.past).toHaveLength(1);
    expect(store().undoLabel).toBe("Place course");
    store().setSelectedCredits("TEST 1", 3);
    store().setExpectedGrade("TEST 1", "A");
    store().setAllocation("TEST 1", "split");
    store().setProgramProfile({ coreProgramId: "core", primaryMajorId: "cs", secondMajorId: "ds", minorIds: ["math-minor"] });
    expect(store().history.past).toHaveLength(5);
    expect(store().activePrograms).toEqual(["core", "cs", "ds", "math-minor"]);
  });

  it("records the remaining user-visible mutation categories and suppresses no-ops", () => {
    const store = () => usePlannerStore.getState();
    store().setStudyAway("Y2F", "newyork");
    store().toggleCompletedSemester("Y1F");
    store().recordFulfillmentFact({ id: "fact", kind: "waiver", requirementId: "core/x", label: "Waiver" });
    store().dismissWarning("warning");
    store().setStartYear(2026);
    store().addCustomCourse({ id: "CUSTOM 1", title: "Custom", credits: 4, department: "Custom", prereqs: [], offered: [], offeringKnown: false, sites: ["shanghai"], fulfills: [], equivalentTo: [], attributes: [], tags: [] });
    expect(store().history.past).toHaveLength(6);
    store().removeCourse("missing");
    store().dismissWarning("warning");
    expect(store().history.past).toHaveLength(6);
  });

  it("undoes and redoes without adding history noise", () => {
    const store = () => usePlannerStore.getState();
    store().setStartYear(2026);
    store().undo();
    expect(store().startYear).toBe(2025);
    expect(store().canRedo).toBe(true);
    store().redo();
    expect(store().startYear).toBe(2026);
    expect(store().history.past).toHaveLength(1);
  });

  it("catalog reconciliation and persisted partial state exclude history", () => {
    const store = () => usePlannerStore.getState();
    store().reconcilePrograms(["core", "cs"], ["core", "cs"]);
    expect(store().history.past).toHaveLength(0);
    const persisted = plannerPersistedState(store()) as unknown as Record<string, unknown>;
    expect(persisted.history).toBeUndefined();
    expect(persisted.placements).toEqual([]);
  });
});
