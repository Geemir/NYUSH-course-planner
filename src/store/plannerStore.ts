import { create } from "zustand";
import { persist } from "zustand/middleware";
import { activeProgramIds, type ProgramProfile } from "@/lib/programProfile";
import type {
  Allocation,
  Course,
  FulfillmentFact,
  Grade,
  PlanPlacementV2,
  PlanningSlot,
  PlanSnapshot,
  PlanSnapshotV2,
  PersistedPlanSnapshot,
  RequirementStatusOverride,
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
  planningSlots: PlanningSlot[];
  studyAway: Partial<Record<SemesterId, string>>;
  completedSemesters: SemesterId[];
  activePrograms: string[];
  programProfile: ProgramProfile;
  unresolvedProgramIds: string[];
  customCourses: Course[];
  fulfillmentFacts: FulfillmentFact[];
  requirementStatusOverrides: RequirementStatusOverride[];
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
  applySamplePlan(changeSet: SamplePlanChangeSet): void;
  replacePlanningSlot(slotId: string, course: CoursePlacementInput): void;
  updatePlanningSlot(
    slotId: string,
    changes: Partial<Pick<PlanningSlot, "label" | "credits" | "semesterId">>,
  ): void;
  removePlanningSlot(slotId: string): void;
  reconcilePrograms(validIds: readonly string[], defaultIds: readonly string[]): void;
  repointPlacements(resolved: readonly { courseId: string; catalogCourseId: string; titleSnapshot?: string }[]): void;
  addCustomCourse(course: Course): void;
  removeCustomCourse(courseId: string): void;
  recordFulfillmentFact(fact: FulfillmentFact): void;
  removeFulfillmentFact(factId: string): void;
  setRequirementStatus(programId: string, categoryId: string, status: RequirementStatusOverride["status"] | null): void;
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
  selectedCredits?: number;
}

export type SamplePlanPlacementInput = Omit<
  PlanPlacementV2,
  "placementId" | "allocation"
> & { placementId?: string; allocation?: Allocation };

export interface SamplePlanChangeSet {
  placements: SamplePlanPlacementInput[];
  slots: PlanningSlot[];
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

function mergeSamplePlacements(
  current: readonly PlanPlacementV2[],
  incoming: readonly SamplePlanPlacementInput[],
): PlanPlacementV2[] {
  const placements = current.map((placement) => structuredClone(placement));
  for (const placement of incoming) {
    if (placement.placementId) {
      const exactIndex = placements.findIndex(
        (currentPlacement) =>
          currentPlacement.placementId === placement.placementId,
      );
      if (exactIndex >= 0) {
        placements[exactIndex] = {
          ...placements[exactIndex],
          ...structuredClone(placement),
          placementId: placements[exactIndex].placementId,
          allocation: placement.allocation ?? placements[exactIndex].allocation,
        };
        continue;
      }
    }
    const identity = placement.catalogCourseId ?? placement.courseId;
    if (placementIndex(placements, identity) >= 0) continue;
    placements.push({
      ...structuredClone(placement),
      placementId: newPlacementId(),
      allocation: placement.allocation ?? "auto",
    });
  }
  return placements;
}

function mergeSlotsBySourceKey(
  current: readonly PlanningSlot[],
  incoming: readonly PlanningSlot[],
): PlanningSlot[] {
  const bySourceKey = new Map(
    current.map((slot) => [slot.sourceKey, structuredClone(slot)]),
  );
  incoming.forEach((slot) =>
    bySourceKey.set(slot.sourceKey, structuredClone(slot)),
  );
  return [...bySourceKey.values()];
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
  planningSlots: [],
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
  requirementStatusOverrides: [],
  dismissedWarnings: [],
  startYear: 2025,
};

function presentFromState(state: PlannerPresent): PlannerPresent {
  return structuredClone({
    placements: state.placements,
    planningSlots: state.planningSlots,
    studyAway: state.studyAway,
    completedSemesters: state.completedSemesters,
    activePrograms: state.activePrograms,
    programProfile: state.programProfile,
    unresolvedProgramIds: state.unresolvedProgramIds,
    customCourses: state.customCourses,
    fulfillmentFacts: state.fulfillmentFacts,
    requirementStatusOverrides: state.requirementStatusOverrides,
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
            planningSlots: structuredClone(snapshot.planningSlots ?? []),
            studyAway: structuredClone(snapshot.studyAway),
            completedSemesters: [...snapshot.completedSemesters],
            activePrograms: activeProgramIds(snapshot.programProfile),
            programProfile: structuredClone(snapshot.programProfile),
            unresolvedProgramIds: [...snapshot.unresolvedProgramIds],
            customCourses: structuredClone(snapshot.customCourses),
            fulfillmentFacts: structuredClone(snapshot.fulfillmentFacts),
            requirementStatusOverrides: structuredClone(snapshot.requirementStatusOverrides ?? []),
            dismissedWarnings: [...snapshot.dismissedWarnings],
            startYear: snapshot.startYear,
          };
          const history = createHistory(present);
          return { ...present, ...historyFields(history) };
        }),
        replacePlanV2: (snapshot) => mutate("Use server plan", () => ({
          placements: structuredClone(snapshot.placements),
          planningSlots: structuredClone(snapshot.planningSlots ?? []),
          studyAway: structuredClone(snapshot.studyAway),
          completedSemesters: [...snapshot.completedSemesters],
          activePrograms: activeProgramIds(snapshot.programProfile),
          programProfile: structuredClone(snapshot.programProfile),
          unresolvedProgramIds: [...snapshot.unresolvedProgramIds],
          customCourses: structuredClone(snapshot.customCourses),
          fulfillmentFacts: structuredClone(snapshot.fulfillmentFacts),
          requirementStatusOverrides: structuredClone(snapshot.requirementStatusOverrides ?? []),
          dismissedWarnings: [...snapshot.dismissedWarnings],
          startYear: snapshot.startYear,
        })),
        applySamplePlan: (changeSet) =>
          mutate("Apply sample study plan", (present) => ({
            ...present,
            placements: mergeSamplePlacements(
              present.placements,
              changeSet.placements,
            ),
            planningSlots: mergeSlotsBySourceKey(
              present.planningSlots,
              changeSet.slots,
            ),
          })),
        replacePlanningSlot: (slotId, course) =>
          mutate("Choose course for planning slot", (present) => {
            const slot = present.planningSlots.find((item) => item.id === slotId);
            if (!slot) return present;
            return {
              ...present,
              placements: mergeSamplePlacements(present.placements, [
                { ...course, semesterId: slot.semesterId },
              ]),
              planningSlots: present.planningSlots.filter(
                (item) => item.id !== slotId,
              ),
            };
          }),
        updatePlanningSlot: (slotId, changes) =>
          mutate("Edit planning slot", (present) => ({
            ...present,
            planningSlots: present.planningSlots.map((slot) =>
              slot.id === slotId ? { ...slot, ...changes } : slot,
            ),
          })),
        removePlanningSlot: (slotId) =>
          mutate("Remove planning slot", (present) => ({
            ...present,
            planningSlots: present.planningSlots.filter(
              (slot) => slot.id !== slotId,
            ),
          })),
        reconcilePrograms: (validIds, defaultIds) => set((state) => {
          // Preserve the profile's role structure; only drop ids the active
          // catalog no longer contains (falling back to defaults for the two
          // required roles). Re-deriving roles from a flat id list would
          // mis-promote a minor into the second-major slot.
          const valid = new Set(validIds);
          const profile = state.programProfile;
          const programProfile: ProgramProfile = {
            coreProgramId: valid.has(profile.coreProgramId)
              ? profile.coreProgramId
              : valid.has(defaultIds[0]) ? defaultIds[0] : profile.coreProgramId,
            // An unresolved primary major stays unresolved — substituting the
            // catalog's first major would silently commit an arbitrary choice
            // (alphabetically, Biology). The profile sheet shows a "Select a
            // major…" placeholder instead.
            primaryMajorId: profile.primaryMajorId,
            secondMajorId:
              profile.secondMajorId && valid.has(profile.secondMajorId)
                ? profile.secondMajorId
                : null,
            minorIds: profile.minorIds.filter((id) => valid.has(id)),
          };
          const present = {
            ...presentFromState(state),
            activePrograms: activeProgramIds(programProfile),
            programProfile,
          };
          const history = { ...state.history, present };
          return { ...present, ...historyFields(history) };
        }),
        repointPlacements: (resolved) => set((state) => {
          // Re-point placements whose catalogCourseId is stale (from a previous
          // catalog release) to the current release's record, matched by stable
          // course code. Not an undoable edit — a background reconciliation.
          const byCode = new Map(resolved.map((item) => [item.courseId, item]));
          let changed = false;
          const placements = state.placements.map((placement) => {
            const match = byCode.get(placement.courseId);
            if (match && match.catalogCourseId !== placement.catalogCourseId) {
              changed = true;
              return {
                ...placement,
                catalogCourseId: match.catalogCourseId,
                titleSnapshot: match.titleSnapshot ?? placement.titleSnapshot,
              };
            }
            return placement;
          });
          if (!changed) return state;
          const present = { ...presentFromState(state), placements };
          const history = { ...state.history, present };
          return { ...present, ...historyFields(history) };
        }),
        addCustomCourse: (course) => mutate("Add custom course", (present) => ({ ...present, customCourses: [...present.customCourses.filter((item) => item.id !== course.id), course] })),
        removeCustomCourse: (courseId) => mutate("Remove custom course", (present) => ({ ...present, customCourses: present.customCourses.filter((course) => course.id !== courseId) })),
        recordFulfillmentFact: (fact) => mutate("Add requirement evidence", (present) => ({ ...present, fulfillmentFacts: [...present.fulfillmentFacts.filter((item) => item.id !== fact.id), fact] })),
        removeFulfillmentFact: (factId) => mutate("Remove requirement evidence", (present) => ({ ...present, fulfillmentFacts: present.fulfillmentFacts.filter((fact) => fact.id !== factId) })),
        setRequirementStatus: (programId, categoryId, status) => mutate("Change requirement status", (present) => ({
          ...present,
          requirementStatusOverrides: status === null
            ? present.requirementStatusOverrides.filter((item) => item.programId !== programId || item.categoryId !== categoryId)
            : [
                ...present.requirementStatusOverrides.filter((item) => item.programId !== programId || item.categoryId !== categoryId),
                { programId, categoryId, status },
              ],
        })),
        dismissWarning: (warningId) => mutate("Dismiss warning", (present) => ({ ...present, dismissedWarnings: present.dismissedWarnings.includes(warningId) ? present.dismissedWarnings : [...present.dismissedWarnings, warningId] })),
        restoreWarning: (warningId) => mutate("Restore warning", (present) => ({ ...present, dismissedWarnings: present.dismissedWarnings.filter((id) => id !== warningId) })),
        setStartYear: (startYear) => mutate("Change start year", (present) => ({ ...present, startYear })),
        importPlan: (snapshot) => mutate("Import plan", () => snapshot.version === 2 ? ({
          placements: withPlacementIds(snapshot.placements),
          planningSlots: structuredClone(snapshot.planningSlots ?? []),
          studyAway: snapshot.studyAway,
          completedSemesters: snapshot.completedSemesters,
          activePrograms: activeProgramIds(snapshot.programProfile),
          programProfile: snapshot.programProfile,
          unresolvedProgramIds: snapshot.unresolvedProgramIds,
          customCourses: snapshot.customCourses,
          fulfillmentFacts: snapshot.fulfillmentFacts,
          requirementStatusOverrides: snapshot.requirementStatusOverrides ?? [],
          dismissedWarnings: snapshot.dismissedWarnings,
          startYear: snapshot.startYear,
        }) : ({
          placements: withPlacementIds(snapshot.placements),
          planningSlots: [],
          studyAway: snapshot.studyAway,
          completedSemesters: snapshot.completedSemesters,
          activePrograms: snapshot.activePrograms,
          programProfile: profileFromIds(snapshot.activePrograms),
          unresolvedProgramIds: [],
          customCourses: snapshot.customCourses,
          fulfillmentFacts: snapshot.fulfillmentFacts ?? [],
          requirementStatusOverrides: [],
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
        merged.planningSlots = structuredClone(merged.planningSlots ?? []);
        const history = createHistory(presentFromState(merged));
        return { ...merged, ...historyFields(history) };
      },
    },
  ),
);

export function snapshotFromState(state: PlannerPresent): PlanSnapshot {
  return {
    version: 1,
    placements: state.placements.map((placement) => ({
      courseId: placement.courseId,
      semesterId: placement.semesterId,
      allocation: placement.allocation,
      ...(placement.selectedCredits === undefined ? {} : { selectedCredits: placement.selectedCredits }),
      ...(placement.expectedGrade === undefined ? {} : { expectedGrade: placement.expectedGrade }),
    })),
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
    planningSlots: structuredClone(state.planningSlots),
    studyAway: structuredClone(state.studyAway),
    completedSemesters: [...state.completedSemesters],
    programProfile: structuredClone(state.programProfile),
    unresolvedProgramIds: [...state.unresolvedProgramIds],
    customCourses: structuredClone(state.customCourses),
    fulfillmentFacts: structuredClone(state.fulfillmentFacts),
    requirementStatusOverrides: structuredClone(state.requirementStatusOverrides),
    dismissedWarnings: [...state.dismissedWarnings],
    startYear: state.startYear,
  };
}
