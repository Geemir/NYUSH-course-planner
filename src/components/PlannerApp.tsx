"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { CatalogProvider } from "@/components/CatalogProvider";
import { PlanSync } from "@/components/PlanSync";
import {
  CourseCatalog,
  type CatalogCourseSelection,
} from "@/components/catalog/CourseCatalog";
import { CourseDetailDialog } from "@/components/dialogs/CourseDetailDialog";
import { InspirationStrip } from "@/components/inspiration/InspirationStrip";
import { PlannerHeader } from "@/components/layout/PlannerHeader";
import { PlannerWorkspace } from "@/components/layout/PlannerWorkspace";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import { PlannerBoard } from "@/components/planner/PlannerBoard";
import { PlanDerivedProvider } from "@/components/planner/PlanDerivedProvider";
import { FeasibilityDialog } from "@/components/progress/FeasibilityDialog";
import { ProgressRings } from "@/components/progress/ProgressRings";
import { RequirementChecklist } from "@/components/progress/RequirementChecklist";
import { SpecialRulesPanel } from "@/components/progress/SpecialRulesPanel";
import { WarningCenter } from "@/components/progress/WarningCenter";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCourseData } from "@/hooks/useCourseData";
import { useOnboarding } from "@/hooks/useOnboarding";
import { parsePlanDocument } from "@/lib/planIO";
import { SEMESTER_IDS, SemesterId, type PlanPlacementV2 } from "@/lib/types";
import { usePlannerStore, type CoursePlacementInput } from "@/store/plannerStore";

function DragPreview({ courseId }: { courseId: string }) {
  const { coursesById } = useCourseData();
  const course = coursesById.get(courseId);
  if (!course) return null;
  return (
    <div className="flex w-56 cursor-grabbing flex-col rounded-lg border bg-background px-2.5 py-2 shadow-lg">
      <span className="font-mono text-xs text-muted-foreground">
        {course.id}
      </span>
      <span className="truncate text-sm font-medium">{course.title}</span>
    </div>
  );
}

const emptySubscribe = () => () => {};

export function PlannerApp() {
  // false during SSR/hydration, true on the client — gates rendering of
  // localStorage-backed state without a hydration mismatch.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [detailSelection, setDetailSelection] = useState<
    CatalogCourseSelection | { kind: "legacy"; courseId: string } | null
  >(null);
  const [dragCourseId, setDragCourseId] = useState<string | null>(null);
  const onboarding = useOnboarding();
  const guideButtonRef = useRef<HTMLButtonElement>(null);
  const justDragged = useRef(false);
  // When a catalog dropdown closes, the browser's trailing click event can
  // hit-test against the card underneath it — swallow those stray clicks.
  const suppressClicksUntil = useRef(0);
  const placeCourse = usePlannerStore((s) => s.placeCourse);
  const importPlan = usePlannerStore((s) => s.importPlan);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading planner…
      </div>
    );
  }

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { course?: CoursePlacementInput; placementId?: string; courseId?: string } | undefined;
    setDragCourseId(data?.course?.courseId ?? data?.courseId ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragCourseId(null);
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 150);
    const data = event.active.data.current as { course?: CoursePlacementInput; placementId?: string } | undefined;
    const overId = event.over ? String(event.over.id) : null;
    if (
      (data?.course || data?.placementId) &&
      overId &&
      (SEMESTER_IDS as readonly string[]).includes(overId)
    ) {
      placeCourse(data.placementId ?? data.course!, overId as SemesterId);
    }
  };

  const canOpenDetail = () => {
    if (justDragged.current || Date.now() < suppressClicksUntil.current) return;
    return true;
  };

  const handleSelectCatalogCourse = (selection: CatalogCourseSelection) => {
    if (!canOpenDetail()) return;
    setDetailSelection(selection);
  };

  const handleSelectPlannedCourse = (placement: PlanPlacementV2) => {
    if (!canOpenDetail()) return;
    setDetailSelection(placement.catalogCourseId
      ? { kind: "bulletin", stableId: placement.catalogCourseId }
      : { kind: "legacy", courseId: placement.courseId });
  };

  const handleMenuClosed = () => {
    suppressClicksUntil.current = Date.now() + 350;
  };

  const handleImportFile = async (file: File) => {
    try {
      const snapshot = parsePlanDocument(await file.text());
      importPlan(snapshot);
      toast.success(
        `Imported plan with ${snapshot.placements.length} courses`,
      );
    } catch {
      toast.error("Could not import that file — is it a valid plan export?");
    }
  };

  return (
    <CatalogProvider>
      <PlanDerivedProvider>
        <TooltipProvider>
          <PlanSync />
          <div className="flex min-h-screen flex-col">
            <PlannerHeader
              guideButtonRef={guideButtonRef}
              onGuide={onboarding.restart}
              onImportFile={handleImportFile}
            />
            <div className="px-4 pt-4 sm:px-6 sm:pt-6">
              <InspirationStrip />
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={pointerWithin}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <PlannerWorkspace
                catalog={
                  <CourseCatalog
                    onSelectCourse={handleSelectCatalogCourse}
                    onMenuClosed={handleMenuClosed}
                  />
                }
                timeline={
                  <PlannerBoard onSelectCourse={handleSelectPlannedCourse} />
                }
                progress={
                  <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
                    <ProgressRings />
                    <FeasibilityDialog />
                    <Separator />
                    <RequirementChecklist />
                    <Separator />
                    <SpecialRulesPanel />
                    <div>
                      <h3 className="text-sm font-semibold">Warnings</h3>
                      <WarningCenter />
                    </div>
                  </div>
                }
              />

              <DragOverlay>
                {dragCourseId && <DragPreview courseId={dragCourseId} />}
              </DragOverlay>
            </DndContext>

            <OnboardingDialog
              open={onboarding.open}
              onOpenChange={onboarding.setOpen}
              onComplete={onboarding.complete}
              returnFocusRef={guideButtonRef}
            />
            <CourseDetailDialog
              stableId={detailSelection?.kind === "bulletin" ? detailSelection.stableId : null}
              courseId={detailSelection && detailSelection.kind !== "bulletin" ? detailSelection.courseId : null}
              onClose={() => setDetailSelection(null)}
            />
          </div>
        </TooltipProvider>
      </PlanDerivedProvider>
    </CatalogProvider>
  );
}
