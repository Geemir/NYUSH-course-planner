"use client";

import { useRef } from "react";
import {
  BookOpen,
  Download,
  GraduationCap,
  LogIn,
  LogOut,
  Menu,
  Moon,
  RotateCcw,
  Shield,
  Sun,
  Upload,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useCatalog } from "@/components/CatalogProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePlanDerived } from "@/hooks/usePlanDerived";
import {
  CUSTOM_PLAN_ID,
  degreeOptionsFromPrograms,
  matchDegreePlan,
} from "@/lib/degreePlans";
import { downloadPlan } from "@/lib/planIO";
import { snapshotFromState, usePlannerStore } from "@/store/plannerStore";

const START_YEARS = [2022, 2023, 2024, 2025, 2026, 2027, 2028];

type PlannerHeaderProps = {
  onGuide: () => void;
  onImportFile: (file: File) => void;
};

export function PlannerHeader({
  onGuide,
  onImportFile,
}: PlannerHeaderProps) {
  const { programs } = useCatalog();
  const { progress } = usePlanDerived();
  const activePrograms = usePlannerStore((state) => state.activePrograms);
  const setActivePrograms = usePlannerStore(
    (state) => state.setActivePrograms,
  );
  const startYear = usePlannerStore((state) => state.startYear);
  const setStartYear = usePlannerStore((state) => state.setStartYear);
  const reset = usePlannerStore((state) => state.reset);
  const { resolvedTheme, setTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const degreeOptions = degreeOptionsFromPrograms(programs);
  const currentPlanId = matchDegreePlan(activePrograms, degreeOptions);
  const currentPlanLabel =
    degreeOptions.find((option) => option.id === currentPlanId)?.label ??
    "Custom program mix";

  const resetPlan = () => {
    if (window.confirm("Clear the entire plan? This cannot be undone.")) {
      reset();
      toast.success("Plan cleared");
    }
  };

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] flex h-18 items-center gap-4 border-b bg-background px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <GraduationCap className="size-5" aria-hidden="true" />
        </div>
        <div className="hidden min-w-0 flex-col sm:flex">
          <h1 className="truncate text-base leading-5 font-semibold tracking-[-0.01em]">
            NYUSH Course Planner
          </h1>
          <span className="truncate text-xs leading-4 text-muted-foreground">
            {currentPlanLabel} · four-year plan
          </span>
        </div>
      </div>

      <nav
        aria-label="Planner controls"
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <Badge
          variant="secondary"
          className="hidden h-8 shrink-0 px-3 text-sm tabular-nums md:inline-flex"
        >
          {progress.credits.planned}/{progress.credits.goal} credits
        </Badge>

        <div className="hidden min-w-0 items-center gap-2 lg:flex">
          <Select
            value={currentPlanId}
            onValueChange={(id) => {
              const option = degreeOptions.find((item) => item.id === id);
              if (option) setActivePrograms(option.programs);
            }}
          >
            <SelectTrigger
              aria-label="Degree plan"
              className="h-11 w-48 text-sm"
            >
              <SelectValue>{() => currentPlanLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {degreeOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
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
            onValueChange={(value) => setStartYear(Number(value))}
          >
            <SelectTrigger
              aria-label="Entry year"
              className="h-11 w-52 text-sm"
            >
              <SelectValue>
                {(value: string) =>
                  `Entered Fall ${value} · Class of ${Number(value) + 4}`
                }
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
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            className="h-11 px-3"
            onClick={onGuide}
          >
            <BookOpen aria-hidden="true" />
            Guide
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  className="h-11 min-w-11 px-3"
                  aria-label="Plan actions"
                />
              }
            >
              <Menu aria-hidden="true" />
              <span className="hidden xl:inline">Plan actions</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Plan actions</DropdownMenuLabel>
                <DropdownMenuItem
                  className="min-h-11"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload aria-hidden="true" />
                  Import plan
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11"
                  onClick={() =>
                    downloadPlan(snapshotFromState(usePlannerStore.getState()))
                  }
                >
                  <Download aria-hidden="true" />
                  Export plan
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                className="min-h-11"
                onClick={resetPlan}
              >
                <RotateCcw aria-hidden="true" />
                Reset plan
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportFile(file);
              event.target.value = "";
            }}
          />

          <Button
            type="button"
            variant="ghost"
            className="size-11"
            aria-label="Toggle dark mode"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            {resolvedTheme === "dark" ? (
              <Sun aria-hidden="true" />
            ) : (
              <Moon aria-hidden="true" />
            )}
          </Button>
          <AuthControl />
        </div>
      </nav>
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
            className="h-11 px-3"
            nativeButton={false}
            render={<a href="/admin" />}
          >
            <Shield aria-hidden="true" />
            <span className="hidden xl:inline">Admin</span>
          </Button>
        )}
        <Button
          variant="ghost"
          className="h-11 px-3"
          title={`Signed in as ${label} — sign out`}
          onClick={() => signOut()}
        >
          <LogOut aria-hidden="true" />
          <span className="hidden max-w-32 truncate xl:inline">{label}</span>
        </Button>
      </>
    );
  }

  return (
    <Button
      variant="default"
      className="h-11 px-3"
      aria-label="Sign in"
      nativeButton={false}
      render={<a href="/signin" />}
    >
      <LogIn aria-hidden="true" />
      <span className="hidden xl:inline">Sign in</span>
    </Button>
  );
}
