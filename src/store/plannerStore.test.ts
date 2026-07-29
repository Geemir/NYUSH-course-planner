import { beforeEach, describe, expect, it } from "vitest";
import { createHistory } from "@/store/planHistory";
import {
  usePlannerStore,
  plannerPersistedState,
  type PlannerPresent,
} from "@/store/plannerStore";

const initial: PlannerPresent = {
  placements: [], planningSlots: [], studyAway: {}, completedSemesters: [],
  activePrograms: ["core", "cs"],
  programProfile: { coreProgramId: "core", primaryMajorId: "cs", secondMajorId: null, minorIds: [] },
  unresolvedProgramIds: [],
  customCourses: [], fulfillmentFacts: [], requirementStatusOverrides: [], dismissedWarnings: [], startYear: 2025,
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

  it("sets, replaces, clears, undoes, and redoes a category status override", () => {
    const store = () => usePlannerStore.getState();
    store().setRequirementStatus("cs", "electives", "planned");
    expect(store().requirementStatusOverrides).toEqual([
      { programId: "cs", categoryId: "electives", status: "planned" },
    ]);
    store().setRequirementStatus("cs", "electives", "completed");
    expect(store().requirementStatusOverrides[0].status).toBe("completed");
    store().undo();
    expect(store().requirementStatusOverrides[0].status).toBe("planned");
    store().redo();
    expect(store().requirementStatusOverrides[0].status).toBe("completed");
    store().setRequirementStatus("cs", "electives", null);
    expect(store().requirementStatusOverrides).toEqual([]);
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

  it("keeps same-code Bulletin records distinct by source-scoped identity", () => {
    const store = () => usePlannerStore.getState();
    store().placeCourse({ courseId: "MATH-UA 1", catalogCourseId: "cas:math-1", titleSnapshot: "Calculus I" }, "Y1F");
    store().placeCourse({ courseId: "MATH-UA 1", catalogCourseId: "tandon:math-1", titleSnapshot: "Calculus for Engineers" }, "Y1S");
    expect(store().placements).toHaveLength(2);
    expect(new Set(store().placements.map((placement) => placement.placementId)).size).toBe(2);
    const first = store().placements[0];
    store().removeCourse(first.placementId);
    expect(store().placements.map((placement) => placement.catalogCourseId)).toEqual(["tandon:math-1"]);
  });

  it("applies a sample plan and undoes courses and slots atomically", () => {
    const store = () => usePlannerStore.getState();
    const slot = {
      id: "slot-chinese",
      sourceKey: "cs/sample/0/1",
      semesterId: "Y1F" as const,
      label: "Chinese or EAP",
      credits: 4,
      source: {
        kind: "bulletin-sample-plan" as const,
        programId: "computer-science-bs",
        catalogReleaseId: "release-a",
        sectionId: "sampleplanofstudytext",
        termSourceIndex: 0,
        rowSourceIndex: 1,
      },
    };

    store().applySamplePlan({
      placements: [
        {
          courseId: "MATH-SHU 131",
          catalogCourseId: "nyu-shanghai:MATH-SHU 131",
          titleSnapshot: "Calculus",
          semesterId: "Y1F",
        },
      ],
      slots: [slot],
    });

    expect(store().placements).toHaveLength(1);
    expect(store().planningSlots).toEqual([slot]);
    expect(store().undoLabel).toBe("Apply sample study plan");
    store().undo();
    expect(store().placements).toEqual([]);
    expect(store().planningSlots).toEqual([]);
  });

  it("replaces, edits, and removes planning slots with one history entry each", () => {
    const store = () => usePlannerStore.getState();
    const slot = {
      id: "slot-elective",
      sourceKey: "cs/sample/2/0",
      semesterId: "Y2F" as const,
      label: "General Elective",
      credits: 4,
      source: {
        kind: "bulletin-sample-plan" as const,
        programId: "computer-science-bs",
        catalogReleaseId: "release-a",
        sectionId: "sampleplanofstudytext",
        termSourceIndex: 2,
        rowSourceIndex: 0,
      },
    };
    store().applySamplePlan({ placements: [], slots: [slot] });
    store().updatePlanningSlot(slot.id, { label: "Open Elective" });
    expect(store().planningSlots[0].label).toBe("Open Elective");
    store().replacePlanningSlot(slot.id, {
      courseId: "CSCI-SHU 210",
      catalogCourseId: "nyu-shanghai:CSCI-SHU 210",
      titleSnapshot: "Data Structures",
    });
    expect(store().planningSlots).toEqual([]);
    expect(store().placements[0]).toMatchObject({
      courseId: "CSCI-SHU 210",
      semesterId: "Y2F",
    });
    expect(store().undoLabel).toBe("Choose course for planning slot");
    store().undo();
    expect(store().planningSlots[0].label).toBe("Open Elective");
    store().removePlanningSlot(slot.id);
    expect(store().planningSlots).toEqual([]);
  });
});
