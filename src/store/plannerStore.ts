import { create } from "zustand";
import { persist } from "zustand/middleware";
import { COURSES_BY_ID } from "@/lib/data";
import { reconcileProgramSelection } from "@/lib/degreePlans";
import {
  Allocation,
  Course,
  FulfillmentFact,
  Grade,
  Placement,
  PlanSnapshot,
  SemesterId,
} from "@/lib/types";

interface PlannerState {
  placements: Placement[];
  studyAway: Partial<Record<SemesterId, string>>;
  completedSemesters: SemesterId[];
  activePrograms: string[];
  customCourses: Course[];
  fulfillmentFacts: FulfillmentFact[];
  dismissedWarnings: string[];
  startYear: number;

  placeCourse: (courseId: string, semesterId: SemesterId) => void;
  removeCourse: (courseId: string) => void;
  setAllocation: (courseId: string, allocation: Allocation) => void;
  setExpectedGrade: (courseId: string, grade: Grade | null) => void;
  setStudyAway: (semesterId: SemesterId, siteId: string | null) => void;
  toggleCompletedSemester: (semesterId: SemesterId) => void;
  toggleProgram: (programId: string) => void;
  setActivePrograms: (programIds: string[]) => void;
  reconcilePrograms: (
    validIds: readonly string[],
    defaultIds: readonly string[],
  ) => void;
  addCustomCourse: (course: Course) => void;
  removeCustomCourse: (courseId: string) => void;
  dismissWarning: (warningId: string) => void;
  restoreWarning: (warningId: string) => void;
  setStartYear: (year: number) => void;
  importPlan: (snapshot: PlanSnapshot) => void;
  reset: () => void;
}

const initialState = {
  placements: [] as Placement[],
  studyAway: {} as Partial<Record<SemesterId, string>>,
  completedSemesters: [] as SemesterId[],
  // Default to the CS + IMA double-major plan; swap via the degree-plan chooser.
  activePrograms: ["core", "cs", "ima"],
  customCourses: [] as Course[],
  fulfillmentFacts: [] as FulfillmentFact[],
  dismissedWarnings: [] as string[],
  startYear: 2025,
};

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set) => ({
      ...initialState,

      // A course appears at most once in the plan: placing an already-placed
      // course moves it, preserving its allocation choice.
      placeCourse: (courseId, semesterId) =>
        set((state) => {
          const existing = state.placements.find((p) => p.courseId === courseId);
          if (existing) {
            return {
              placements: state.placements.map((p) =>
                p.courseId === courseId ? { ...p, semesterId } : p,
              ),
            };
          }
          return {
            placements: [
              ...state.placements,
              { courseId, semesterId, allocation: "auto" },
            ],
          };
        }),

      removeCourse: (courseId) =>
        set((state) => ({
          placements: state.placements.filter((p) => p.courseId !== courseId),
        })),

      setAllocation: (courseId, allocation) =>
        set((state) => ({
          placements: state.placements.map((p) =>
            p.courseId === courseId ? { ...p, allocation } : p,
          ),
        })),

      setExpectedGrade: (courseId, grade) =>
        set((state) => ({
          placements: state.placements.map((p) =>
            p.courseId === courseId
              ? { ...p, expectedGrade: grade ?? undefined }
              : p,
          ),
        })),

      setStudyAway: (semesterId, siteId) =>
        set((state) => {
          const studyAway = { ...state.studyAway };
          if (siteId === null) {
            delete studyAway[semesterId];
          } else {
            studyAway[semesterId] = siteId;
          }
          return { studyAway };
        }),

      toggleCompletedSemester: (semesterId) =>
        set((state) => ({
          completedSemesters: state.completedSemesters.includes(semesterId)
            ? state.completedSemesters.filter((s) => s !== semesterId)
            : [...state.completedSemesters, semesterId],
        })),

      toggleProgram: (programId) =>
        set((state) => ({
          activePrograms: state.activePrograms.includes(programId)
            ? state.activePrograms.filter((p) => p !== programId)
            : [...state.activePrograms, programId],
        })),

      // Replaces the tracked-program set wholesale (used by degree-plan presets).
      setActivePrograms: (programIds) => set({ activePrograms: programIds }),

      reconcilePrograms: (validIds, defaultIds) =>
        set((state) => ({
          activePrograms: reconcileProgramSelection(
            state.activePrograms,
            validIds,
            defaultIds,
          ),
        })),

      // Upserts by course id — re-importing an existing code replaces it,
      // which also lets a custom course shadow/fix a built-in one.
      addCustomCourse: (course) =>
        set((state) => ({
          customCourses: [
            ...state.customCourses.filter((c) => c.id !== course.id),
            course,
          ],
        })),

      removeCustomCourse: (courseId) =>
        set((state) => ({
          customCourses: state.customCourses.filter((c) => c.id !== courseId),
          // Keep the placement only if a built-in course backs the same id.
          placements: COURSES_BY_ID.has(courseId)
            ? state.placements
            : state.placements.filter((p) => p.courseId !== courseId),
        })),

      dismissWarning: (warningId) =>
        set((state) => ({
          dismissedWarnings: state.dismissedWarnings.includes(warningId)
            ? state.dismissedWarnings
            : [...state.dismissedWarnings, warningId],
        })),

      restoreWarning: (warningId) =>
        set((state) => ({
          dismissedWarnings: state.dismissedWarnings.filter(
            (id) => id !== warningId,
          ),
        })),

      setStartYear: (year) => set({ startYear: year }),

      importPlan: (snapshot) =>
        set({
          placements: snapshot.placements,
          studyAway: snapshot.studyAway,
          completedSemesters: snapshot.completedSemesters,
          activePrograms: snapshot.activePrograms,
          customCourses: snapshot.customCourses,
          fulfillmentFacts: snapshot.fulfillmentFacts ?? [],
          dismissedWarnings: snapshot.dismissedWarnings,
          startYear: snapshot.startYear,
        }),

      reset: () => set(initialState),
    }),
    { name: "nyush-planner-v1" },
  ),
);

export function snapshotFromState(state: {
  placements: Placement[];
  studyAway: Partial<Record<SemesterId, string>>;
  completedSemesters: SemesterId[];
  activePrograms: string[];
  customCourses: Course[];
  fulfillmentFacts: FulfillmentFact[];
  dismissedWarnings: string[];
  startYear: number;
}): PlanSnapshot {
  return {
    version: 1,
    placements: state.placements,
    studyAway: state.studyAway,
    completedSemesters: state.completedSemesters,
    activePrograms: state.activePrograms,
    customCourses: state.customCourses,
    fulfillmentFacts: state.fulfillmentFacts,
    dismissedWarnings: state.dismissedWarnings,
    startYear: state.startYear,
  };
}
