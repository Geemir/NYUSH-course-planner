import { create } from "zustand";
import { persist } from "zustand/middleware";
import { reconcileProgramSelection } from "@/lib/degreePlans";
import { activeProgramIds, type ProgramProfile } from "@/lib/programProfile";
import type {
  Allocation,
  Course,
  FulfillmentFact,
  Grade,
  PlanPlacementV2,
  PlanSnapshot,
  PlanSnapshotV2,
  PersistedPlanSnapshot,
  SemesterId,
} from "@/lib/types";
import {
  createHistory,
  recordHistory,
  redoHistory,
  undoHistory,
  type PlanHistory,
} from "@/store/planHistory";

export interface PlannerPresent {
  placements: PlanPlacementV2[];
  studyAway: Partial<Record<SemesterId, string>>;
  completedSemesters: SemesterId[];
  activePrograms: string[];
  programProfile: ProgramProfile;
  unresolvedProgramIds: string[];
  customCourses: Course[];
  fulfillmentFacts: FulfillmentFact[];
  dismissedWarnings: string[];
  startYear: number;
}

interface PlannerState extends PlannerPresent {
  history: PlanHistory<PlannerPresent>;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  placeCourse(course: CoursePlacementInput | string, semesterId: SemesterId): void;
  removeCourse(placementId: string): void;
  setAllocation(placementId: string, allocation: Allocation): void;
  setSelectedCredits(placementId: string, credits: number): void;
  setExpectedGrade(placementId: string, grade: Grade | null): void;
  setStudyAway(semesterId: SemesterId, siteId: string | null): void;
  toggleCompletedSemester(semesterId: SemesterId): void;
  toggleProgram(programId: string): void;
  setActivePrograms(programIds: string[]): void;
  setProgramProfile(profile: ProgramProfile): void;
  hydratePlan(snapshot: PlanSnapshotV2): void;
  replacePlanV2(snapshot: PlanSnapshotV2): void;
  reconcilePrograms(validIds: readonly string[], defaultIds: readonly string[]): void;
  addCustomCourse(course: Course): void;
  removeCustomCourse(courseId: string): void;
  recordFulfillmentFact(fact: FulfillmentFact): void;
  removeFulfillmentFact(factId: string): void;
  dismissWarning(warningId: string): void;
  restoreWarning(warningId: string): void;
  setStartYear(year: number): void;
  importPlan(snapshot: PersistedPlanSnapshot): void;
  reset(): void;
  undo(): void;
  redo(): void;
}

export interface CoursePlacementInput {
  courseId: string;
  catalogCourseId?: string;
  titleSnapshot?: string;
}

let placementSequence = 0;

function newPlacementId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  placementSequence += 1;
  return `placement-${Date.now().toString(36)}-${placementSequence.toString(36)}`;
}

function placementIndex(placements: readonly PlanPlacementV2[], identity: string): number {
  const exact = placements.findIndex((placement) => placement.placementId === identity);
  if (exact >= 0) return exact;
  const sourceScoped = placements.findIndex((placement) => placement.catalogCourseId === identity);
  if (sourceScoped >= 0) return sourceScoped;
  return placements.findIndex((placement) => placement.courseId === identity);
}

function withPlacementIds(placements: readonly (PlanPlacementV2 | Omit<PlanPlacementV2, "placementId">)[]): PlanPlacementV2[] {
  return placements.map((placement) => "placementId" in placement && placement.placementId
    ? structuredClone(placement as PlanPlacementV2)
    : { ...structuredClone(placement), placementId: newPlacementId() });
}

function profileFromIds(ids: readonly string[]): ProgramProfile {
  const coreProgramId = ids.includes("core") ? "core" : ids[0] ?? "core";
  const selected = ids.filter((id) => id !== coreProgramId);
  return {
    coreProgramId,
    primaryMajorId: selected[0] ?? "cs",
    secondMajorId: selected[1] ?? null,
    minorIds: selected.slice(2),
  };
}

const initialPresent: PlannerPresent = {
  placements: [],
  studyAway: {},
  completedSemesters: [],
  activePrograms: ["core", "cs", "ima"],
  programProfile: {
    coreProgramId: "core",
    primaryMajorId: "cs",
    secondMajorId: "ima",
    minorIds: [],
  },
  unresolvedProgramIds: [],
  customCourses: [],
  fulfillmentFacts: [],
  dismissedWarnings: [],
  startYear: 2025,
};

function presentFromState(state: PlannerPresent): PlannerPresent {
  return structuredClone({
    placements: state.placements,
    studyAway: state.studyAway,
    completedSemesters: state.completedSemesters,
    activePrograms: state.activePrograms,
    programProfile: state.programProfile,
    unresolvedProgramIds: state.unresolvedProgramIds,
    customCourses: state.customCourses,
    fulfillmentFacts: state.fulfillmentFacts,
    dismissedWarnings: state.dismissedWarnings,
    startYear: state.startYear,
  });
}

export function plannerPersistedState(state: PlannerPresent): PlannerPresent {
  return presentFromState(state);
}

function historyFields(history: PlanHistory<PlannerPresent>) {
  return {
    history,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undoLabel: history.past.at(-1)?.label ?? null,
    redoLabel: history.future[0]?.label ?? null,
  };
}

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set) => {
      const mutate = (
        label: string,
        recipe: (present: PlannerPresent) => PlannerPresent,
      ) => set((state) => {
        const next = recipe(presentFromState(state));
        const history = recordHistory(state.history, label, next);
        return history === state.history
          ? state
          : { ...state, ...history.present, ...historyFields(history) };
      });

      return {
        ...initialPresent,
        ...historyFields(createHistory(initialPresent)),
        placeCourse: (course, semesterId) => mutate("Place course", (present) => {
          const input = typeof course === "string" ? { courseId: course } : course;
          const identity = input.catalogCourseId ?? input.courseId;
          const index = placementIndex(present.placements, identity);
          present.placements = index >= 0
            ? present.placements.map((item, itemIndex) => itemIndex === index ? { ...item, semesterId } : item)
            : [...present.placements, { ...input, placementId: newPlacementId(), semesterId, allocation: "auto" }];
          return present;
        }),
        removeCourse: (placementId) => mutate("Remove course", (present) => {
          const index = placementIndex(present.placements, placementId);
          return index < 0 ? present : { ...present, placements: present.placements.filter((_, itemIndex) => itemIndex !== index) };
        }),
        setAllocation: (placementId, allocation) => mutate("Change course allocation", (present) => {
          const index = placementIndex(present.placements, placementId);
          return index < 0 ? present : { ...present, placements: present.placements.map((item, itemIndex) => itemIndex === index ? { ...item, allocation } : item) };
        }),
        setSelectedCredits: (placementId, selectedCredits) => mutate("Change course credits", (present) => {
          const index = placementIndex(present.placements, placementId);
          return index < 0 ? present : { ...present, placements: present.placements.map((item, itemIndex) => itemIndex === index ? { ...item, selectedCredits } : item) };
        }),
        setExpectedGrade: (placementId, grade) => mutate("Change expected grade", (present) => {
          const index = placementIndex(present.placements, placementId);
          return index < 0 ? present : { ...present, placements: present.placements.map((item, itemIndex) => itemIndex === index ? { ...item, expectedGrade: grade ?? undefined } : item) };
        }),
        setStudyAway: (semesterId, siteId) => mutate("Change study-away site", (present) => {
          if (siteId === null) delete present.studyAway[semesterId];
          else present.studyAway[semesterId] = siteId;
          return present;
        }),
        toggleCompletedSemester: (semesterId) => mutate("Toggle completed semester", (present) => ({ ...present, completedSemesters: present.completedSemesters.includes(semesterId) ? present.completedSemesters.filter((id) => id !== semesterId) : [...present.completedSemesters, semesterId] })),
        toggleProgram: (programId) => mutate("Change tracked programs", (present) => {
          const activePrograms = present.activePrograms.includes(programId) ? present.activePrograms.filter((id) => id !== programId) : [...present.activePrograms, programId];
          return { ...present, activePrograms, programProfile: profileFromIds(activePrograms) };
        }),
        setActivePrograms: (programIds) => mutate("Change tracked programs", (present) => ({ ...present, activePrograms: [...programIds], programProfile: profileFromIds(programIds) })),
        setProgramProfile: (programProfile) => mutate("Edit Program Profile", (present) => ({ ...present, programProfile: structuredClone(programProfile), activePrograms: activeProgramIds(programProfile) })),
        hydratePlan: (snapshot) => set(() => {
          const present: PlannerPresent = {
            placements: structuredClone(snapshot.placements),
            studyAway: structuredClone(snapshot.studyAway),
            completedSemesters: [...snapshot.completedSemesters],
            activePrograms: activeProgramIds(snapshot.programProfile),
            programProfile: structuredClone(snapshot.programProfile),
            unresolvedProgramIds: [...snapshot.unresolvedProgramIds],
            customCourses: structuredClone(snapshot.customCourses),
            fulfillmentFacts: structuredClone(snapshot.fulfillmentFacts),
            dismissedWarnings: [...snapshot.dismissedWarnings],
            startYear: snapshot.startYear,
          };
          const history = createHistory(present);
          return { ...present, ...historyFields(history) };
        }),
        replacePlanV2: (snapshot) => mutate("Use server plan", () => ({
          placements: structuredClone(snapshot.placements),
          studyAway: structuredClone(snapshot.studyAway),
          completedSemesters: [...snapshot.completedSemesters],
          activePrograms: activeProgramIds(snapshot.programProfile),
          programProfile: structuredClone(snapshot.programProfile),
          unresolvedProgramIds: [...snapshot.unresolvedProgramIds],
          customCourses: structuredClone(snapshot.customCourses),
          fulfillmentFacts: structuredClone(snapshot.fulfillmentFacts),
          dismissedWarnings: [...snapshot.dismissedWarnings],
          startYear: snapshot.startYear,
        })),
        reconcilePrograms: (validIds, defaultIds) => set((state) => {
          const activePrograms = reconcileProgramSelection(state.activePrograms, validIds, defaultIds);
          const present = {
            ...presentFromState(state),
            activePrograms,
            programProfile: profileFromIds(activePrograms),
          };
          const history = { ...state.history, present };
          return { ...present, ...historyFields(history) };
        }),
        addCustomCourse: (course) => mutate("Add custom course", (present) => ({ ...present, customCourses: [...present.customCourses.filter((item) => item.id !== course.id), course] })),
        removeCustomCourse: (courseId) => mutate("Remove custom course", (present) => ({ ...present, customCourses: present.customCourses.filter((course) => course.id !== courseId) })),
        recordFulfillmentFact: (fact) => mutate("Add requirement evidence", (present) => ({ ...present, fulfillmentFacts: [...present.fulfillmentFacts.filter((item) => item.id !== fact.id), fact] })),
        removeFulfillmentFact: (factId) => mutate("Remove requirement evidence", (present) => ({ ...present, fulfillmentFacts: present.fulfillmentFacts.filter((fact) => fact.id !== factId) })),
        dismissWarning: (warningId) => mutate("Dismiss warning", (present) => ({ ...present, dismissedWarnings: present.dismissedWarnings.includes(warningId) ? present.dismissedWarnings : [...present.dismissedWarnings, warningId] })),
        restoreWarning: (warningId) => mutate("Restore warning", (present) => ({ ...present, dismissedWarnings: present.dismissedWarnings.filter((id) => id !== warningId) })),
        setStartYear: (startYear) => mutate("Change start year", (present) => ({ ...present, startYear })),
        importPlan: (snapshot) => mutate("Import plan", () => snapshot.version === 2 ? ({
          placements: withPlacementIds(snapshot.placements),
          studyAway: snapshot.studyAway,
          completedSemesters: snapshot.completedSemesters,
          activePrograms: activeProgramIds(snapshot.programProfile),
          programProfile: snapshot.programProfile,
          unresolvedProgramIds: snapshot.unresolvedProgramIds,
          customCourses: snapshot.customCourses,
          fulfillmentFacts: snapshot.fulfillmentFacts,
          dismissedWarnings: snapshot.dismissedWarnings,
          startYear: snapshot.startYear,
        }) : ({
          placements: withPlacementIds(snapshot.placements),
          studyAway: snapshot.studyAway,
          completedSemesters: snapshot.completedSemesters,
          activePrograms: snapshot.activePrograms,
          programProfile: profileFromIds(snapshot.activePrograms),
          unresolvedProgramIds: [],
          customCourses: snapshot.customCourses,
          fulfillmentFacts: snapshot.fulfillmentFacts ?? [],
          dismissedWarnings: snapshot.dismissedWarnings,
          startYear: snapshot.startYear,
        })),
        reset: () => mutate("Reset plan", () => presentFromState(initialPresent)),
        undo: () => set((state) => {
          const history = undoHistory(state.history);
          return history === state.history ? state : { ...state, ...history.present, ...historyFields(history) };
        }),
        redo: () => set((state) => {
          const history = redoHistory(state.history);
          return history === state.history ? state : { ...state, ...history.present, ...historyFields(history) };
        }),
      };
    },
    {
      name: "nyush-planner-v1",
      partialize: (state) => plannerPersistedState(state) as PlannerState,
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<PlannerState>) };
        if (!(persisted as Partial<PlannerState>).programProfile) {
          merged.programProfile = profileFromIds(merged.activePrograms);
        }
        merged.placements = withPlacementIds(merged.placements);
        const history = createHistory(presentFromState(merged));
        return { ...merged, ...historyFields(history) };
      },
    },
  ),
);

export function snapshotFromState(state: PlannerPresent): PlanSnapshot {
  return {
    version: 1,
    placements: state.placements.map(({ placementId: _placementId, catalogCourseId: _catalogCourseId, titleSnapshot: _titleSnapshot, ...placement }) => placement),
    studyAway: state.studyAway,
    completedSemesters: state.completedSemesters,
    activePrograms: state.activePrograms,
    customCourses: state.customCourses,
    fulfillmentFacts: state.fulfillmentFacts,
    dismissedWarnings: state.dismissedWarnings,
    startYear: state.startYear,
  };
}

export function snapshotV2FromState(
  state: PlannerPresent,
  catalogReleaseId: string | null,
): PlanSnapshotV2 | null {
  return {
    version: 2,
    catalogReleaseId,
    placements: structuredClone(state.placements),
    studyAway: structuredClone(state.studyAway),
    completedSemesters: [...state.completedSemesters],
    programProfile: structuredClone(state.programProfile),
    unresolvedProgramIds: [...state.unresolvedProgramIds],
    customCourses: structuredClone(state.customCourses),
    fulfillmentFacts: structuredClone(state.fulfillmentFacts),
    dismissedWarnings: [...state.dismissedWarnings],
    startYear: state.startYear,
  };
}
