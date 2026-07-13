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
import {
  Download,
  GraduationCap,
  LogIn,
  LogOut,
  Moon,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  Sun,
  Upload,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { CatalogProvider } from "@/components/CatalogProvider";
import { PlanSync } from "@/components/PlanSync";
import { CourseCatalog } from "@/components/catalog/CourseCatalog";
import { CourseDetailDialog } from "@/components/dialogs/CourseDetailDialog";
import { PlannerBoard } from "@/components/planner/PlannerBoard";
import { FeasibilityDialog } from "@/components/progress/FeasibilityDialog";
import { ProgressRings } from "@/components/progress/ProgressRings";
import { RequirementChecklist } from "@/components/progress/RequirementChecklist";
import { SpecialRulesPanel } from "@/components/progress/SpecialRulesPanel";
import { WarningCenter } from "@/components/progress/WarningCenter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCourseData } from "@/hooks/useCourseData";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import { PROGRAMS } from "@/lib/data";
import {
  CUSTOM_PLAN_ID,
  DEGREE_PLANS,
  matchDegreePlan,
} from "@/lib/degreePlans";
import { downloadPlan, parsePlan } from "@/lib/planIO";
import { SEMESTER_IDS, SemesterId } from "@/lib/types";
import { snapshotFromState, usePlannerStore } from "@/store/plannerStore";

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

const START_YEARS = [2022, 2023, 2024, 2025, 2026, 2027, 2028];

function Header({ onImportFile }: { onImportFile: (file: File) => void }) {
  const { progress } = usePlanDerived();
  const activePrograms = usePlannerStore((s) => s.activePrograms);
  const toggleProgram = usePlannerStore((s) => s.toggleProgram);
  const setActivePrograms = usePlannerStore((s) => s.setActivePrograms);
  const startYear = usePlannerStore((s) => s.startYear);
  const setStartYear = usePlannerStore((s) => s.setStartYear);
  const reset = usePlannerStore((s) => s.reset);
  const { resolvedTheme, setTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentPlanId = matchDegreePlan(activePrograms);
  const currentPlanLabel =
    DEGREE_PLANS.find((p) => p.id === currentPlanId)?.label ??
    "Custom program mix";

  return (
    <header className="flex flex-wrap items-center gap-3 border-b bg-card px-5 py-3.5">
      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
        <GraduationCap className="size-5 text-primary" />
      </div>
      <div className="mr-2 flex flex-col">
        <h1 className="text-lg leading-tight font-semibold tracking-tight">
          NYUSH Course Planner
        </h1>
        <span className="text-xs leading-tight text-muted-foreground">
          {currentPlanLabel} · 4-year plan
        </span>
      </div>
      <Badge variant="secondary" className="text-sm tabular-nums">
        {progress.credits.planned}/{progress.credits.goal} credits
      </Badge>
      <Select
        value={currentPlanId}
        onValueChange={(id) => {
          const plan = DEGREE_PLANS.find((p) => p.id === id);
          if (plan) setActivePrograms(plan.programs);
        }}
      >
        <SelectTrigger size="sm" aria-label="Degree plan" className="text-sm">
          <SelectValue>{() => currentPlanLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {DEGREE_PLANS.map((plan) => (
            <SelectItem key={plan.id} value={plan.id}>
              {plan.label}
            </SelectItem>
          ))}
          {currentPlanId === CUSTOM_PLAN_ID && (
            <SelectItem value={CUSTOM_PLAN_ID} disabled>
              Custom program mix
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      <Select
        value={String(startYear)}
        onValueChange={(v) => setStartYear(Number(v))}
      >
        <SelectTrigger size="sm" aria-label="Entry year" className="text-sm">
          <SelectValue>
            {(v: string) => `Entered Fall ${v} · Class of ${Number(v) + 4}`}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {START_YEARS.map((year) => (
            <SelectItem key={year} value={String(year)}>
              Entered Fall {year} · Class of {year + 4}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="ml-auto flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="sm" />}
          >
            <SlidersHorizontal />
            Programs
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Tracked programs</DropdownMenuLabel>
              {PROGRAMS.map((program) => (
                <DropdownMenuCheckboxItem
                  key={program.id}
                  checked={activePrograms.includes(program.id)}
                  onCheckedChange={() => toggleProgram(program.id)}
                  closeOnClick={false}
                >
                  <span
                    className="mr-1 inline-block size-2 rounded-full"
                    style={{ backgroundColor: program.color }}
                  />
                  {program.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadPlan(snapshotFromState(usePlannerStore.getState()))}
        >
          <Download />
          Export
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload />
          Import
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImportFile(file);
            e.target.value = "";
          }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Reset plan"
          onClick={() => {
            if (window.confirm("Clear the entire plan? This cannot be undone.")) {
              reset();
              toast.success("Plan cleared");
            }
          }}
        >
          <RotateCcw />
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label="Toggle dark mode"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? <Sun /> : <Moon />}
          {resolvedTheme === "dark" ? "Light" : "Dark"}
        </Button>
        <AuthControl />
      </div>
    </header>
  );
}

function AuthControl() {
  const { data: session, status } = useSession();
  if (status === "authenticated" && session?.user) {
    const label = session.user.email ?? "Account";
    return (
      <>
        {session.user.role === "admin" && (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href="/admin" />}
          >
            <Shield />
            Admin
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          title={`Signed in as ${label} — sign out`}
          onClick={() => signOut()}
        >
          <LogOut />
          <span className="hidden max-w-32 truncate sm:inline">{label}</span>
        </Button>
      </>
    );
  }
  return (
    <Button
      variant="default"
      size="sm"
      nativeButton={false}
      render={<a href="/signin" />}
    >
      <LogIn />
      Sign in
    </Button>
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
  const [detailCourseId, setDetailCourseId] = useState<string | null>(null);
  const [dragCourseId, setDragCourseId] = useState<string | null>(null);
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

  const courseIdFromDragId = (id: string | number): string | null => {
    const s = String(id);
    if (s.startsWith("catalog:")) return s.slice("catalog:".length);
    if (s.startsWith("chip:")) return s.slice("chip:".length);
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setDragCourseId(courseIdFromDragId(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragCourseId(null);
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 150);
    const courseId = courseIdFromDragId(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (
      courseId &&
      overId &&
      (SEMESTER_IDS as readonly string[]).includes(overId)
    ) {
      placeCourse(courseId, overId as SemesterId);
    }
  };

  const handleSelectCourse = (courseId: string) => {
    if (justDragged.current || Date.now() < suppressClicksUntil.current) return;
    setDetailCourseId(courseId);
  };

  const handleMenuClosed = () => {
    suppressClicksUntil.current = Date.now() + 350;
  };

  const handleImportFile = async (file: File) => {
    try {
      const snapshot = parsePlan(await file.text());
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
      <TooltipProvider>
        <PlanSync />
        <div className="flex min-h-screen flex-col">
        <Header onImportFile={handleImportFile} />
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <main className="grid flex-1 gap-5 p-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_330px]">
            <aside className="lg:sticky lg:top-5 lg:self-start">
              <h2 className="mb-2.5 px-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                Course Catalog
              </h2>
              <CourseCatalog
                onSelectCourse={handleSelectCourse}
                onMenuClosed={handleMenuClosed}
              />
            </aside>

            <section>
              <h2 className="mb-2.5 px-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                4-Year Timeline
              </h2>
              <PlannerBoard onSelectCourse={handleSelectCourse} />
            </section>

            <aside className="lg:col-span-2 xl:col-span-1 xl:sticky xl:top-5 xl:self-start">
              <h2 className="mb-2.5 px-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                Degree Progress
              </h2>
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
            </aside>
          </main>

          <DragOverlay>
            {dragCourseId && <DragPreview courseId={dragCourseId} />}
          </DragOverlay>
        </DndContext>

        <CourseDetailDialog
          courseId={detailCourseId}
          onClose={() => setDetailCourseId(null)}
        />
        </div>
      </TooltipProvider>
    </CatalogProvider>
  );
}
