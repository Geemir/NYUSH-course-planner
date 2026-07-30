"use client";

import {
  useCallback,
  useEffect,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import { BookOpen, ChartNoAxesColumnIncreasing, Search } from "lucide-react";
import { WorkspaceTools } from "@/components/layout/WorkspaceTools";
import {
  PROGRESS_RAIL_GRID_CLASS,
  PROGRESS_RAIL_QUERY,
} from "@/components/layout/workspaceBreakpoints";
import { useLocale } from "@/components/i18n/LocaleProvider";
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
      className="min-w-0 self-start lg:sticky lg:top-24"
    >
      <h2
        id={headingId}
        className="mb-4 px-1 text-base font-semibold text-foreground"
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
  open,
  onOpenChange,
  contentClassName,
}: {
  label: string;
  description: string;
  side: "left" | "right";
  trigger: ReactElement;
  children: ReactNode;
  open?: boolean;
  onOpenChange?(open: boolean): void;
  contentClassName?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger} />
      <SheetContent side={side} className={contentClassName}>
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
  onProgressVisit,
  catalogOpen,
  onCatalogOpenChange,
}: {
  catalog: ReactNode;
  timeline: ReactNode;
  progress: ReactNode;
  onProgressVisit?: () => void;
  catalogOpen?: boolean;
  onCatalogOpenChange?(open: boolean): void;
}) {
  const { t } = useLocale();
  const showCatalogRail = useMediaQuery(LG_QUERY);
  const showProgressRail = useMediaQuery(PROGRESS_RAIL_QUERY);

  useEffect(() => {
    if (showProgressRail) onProgressVisit?.();
  }, [onProgressVisit, showProgressRail]);

  return (
    <>
      <main
        className={`grid min-w-0 flex-1 gap-6 p-4 sm:p-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(620px,1fr)] ${PROGRESS_RAIL_GRID_CLASS}`}
      >
        {showCatalogRail && (
          <WorkspaceRail label={t("workspace.courseCatalog")}>{catalog}</WorkspaceRail>
        )}

        <section
          aria-labelledby="workspace-four-year-plan"
          className="min-w-0"
        >
          <h2
            id="workspace-four-year-plan"
            className="mb-4 px-1 text-base font-semibold text-foreground"
          >
            {t("workspace.fourYearPlan")}
          </h2>
          {timeline}
        </section>

        {showProgressRail && (
          <WorkspaceRail label={t("progress.title")}>{progress}</WorkspaceRail>
        )}
      </main>

      {(!showCatalogRail || !showProgressRail) && (
        <WorkspaceTools>
          {!showCatalogRail && (
            <WorkspaceSheet
              label={t("workspace.courseCatalog")}
              description={t("workspace.catalogDescription")}
              side="left"
              trigger={
                <Button variant="outline" className="h-11 px-4">
                  {/* Book + magnifier together signal "browse and search the
                      course list", not just "open a list". */}
                  <span className="flex shrink-0 items-center gap-0.5">
                    <BookOpen aria-hidden="true" />
                    <Search aria-hidden="true" className="size-3.5" />
                  </span>
                  {t("workspace.courses")}
                </Button>
              }
              open={catalogOpen}
              onOpenChange={onCatalogOpenChange}
            >
              {catalog}
            </WorkspaceSheet>
          )}
          {!showProgressRail && (
            <WorkspaceSheet
              label={t("progress.title")}
              description={t("workspace.progressDescription")}
              side="right"
              contentClassName="sm:w-[min(88vw,52rem)] sm:max-w-[52rem] lg:w-[min(72vw,60rem)] lg:max-w-[60rem]"
              trigger={
                <Button variant="outline" className="h-11 px-4" onClick={onProgressVisit}>
                  <ChartNoAxesColumnIncreasing aria-hidden="true" />
                  {t("workspace.progress")}
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
