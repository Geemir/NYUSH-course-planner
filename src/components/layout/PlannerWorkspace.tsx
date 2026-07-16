"use client";

import {
  useCallback,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import { BookOpen, ChartNoAxesColumnIncreasing } from "lucide-react";
import { WorkspaceTools } from "@/components/layout/WorkspaceTools";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const LG_QUERY = "(min-width: 1024px)";
const TWO_XL_QUERY = "(min-width: 1536px)";

function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

function WorkspaceRail({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const headingId = `workspace-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <aside
      aria-labelledby={headingId}
      className="min-w-0 self-start lg:sticky lg:top-22"
    >
      <h2
        id={headingId}
        className="mb-3 px-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {label}
      </h2>
      {children}
    </aside>
  );
}

function WorkspaceSheet({
  label,
  description,
  side,
  trigger,
  children,
}: {
  label: string;
  description: string;
  side: "left" | "right";
  trigger: ReactElement;
  children: ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger render={trigger} />
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>{label}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <aside
          aria-label={label}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1"
        >
          {children}
        </aside>
      </SheetContent>
    </Sheet>
  );
}

export function PlannerWorkspace({
  catalog,
  timeline,
  progress,
}: {
  catalog: ReactNode;
  timeline: ReactNode;
  progress: ReactNode;
}) {
  const showCatalogRail = useMediaQuery(LG_QUERY);
  const showProgressRail = useMediaQuery(TWO_XL_QUERY);

  return (
    <>
      <main className="grid min-w-0 flex-1 gap-5 p-4 sm:p-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(620px,1fr)] 2xl:grid-cols-[340px_minmax(620px,1fr)_360px]">
        {showCatalogRail && (
          <WorkspaceRail label="Course Catalog">{catalog}</WorkspaceRail>
        )}

        <section
          aria-labelledby="workspace-four-year-plan"
          className="min-w-0"
        >
          <h2
            id="workspace-four-year-plan"
            className="mb-3 px-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase"
          >
            Four-Year Plan
          </h2>
          {timeline}
        </section>

        {showProgressRail && (
          <WorkspaceRail label="Degree Progress">{progress}</WorkspaceRail>
        )}
      </main>

      {(!showCatalogRail || !showProgressRail) && (
        <WorkspaceTools>
          {!showCatalogRail && (
            <WorkspaceSheet
              label="Course Catalog"
              description="Search the Bulletin catalog and add courses to your plan."
              side="left"
              trigger={
                <Button variant="outline" className="h-11 px-4">
                  <BookOpen aria-hidden="true" />
                  Courses
                </Button>
              }
            >
              {catalog}
            </WorkspaceSheet>
          )}
          {!showProgressRail && (
            <WorkspaceSheet
              label="Degree Progress"
              description="Review requirements, feasibility guidance, and planning warnings."
              side="right"
              trigger={
                <Button variant="outline" className="h-11 px-4">
                  <ChartNoAxesColumnIncreasing aria-hidden="true" />
                  Progress
                </Button>
              }
            >
              {progress}
            </WorkspaceSheet>
          )}
        </WorkspaceTools>
      )}
    </>
  );
}
