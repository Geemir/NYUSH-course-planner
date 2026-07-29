"use client";

import { useRef, useState, type RefObject } from "react";
import {
  AlertCircle,
  BookOpen,
  CircleHelp,
  FileJson,
  FileSpreadsheet,
  FileText,
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
import { ReportIssueDialog } from "@/components/corrections/ReportIssueDialog";
import { MyReportsSheet } from "@/components/corrections/MyReportsSheet";
import { NotificationMenu } from "@/components/corrections/NotificationMenu";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useCatalog } from "@/components/CatalogProvider";
import { ProgramProfileSheet } from "@/components/programs/ProgramProfileSheet";
import { ProgramProfileSummary, programProfileLabel } from "@/components/programs/ProgramProfileSummary";
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
import { buildPlanExportModel, planExportFilename } from "@/lib/planExport/model";
import { downloadPlanJson } from "@/lib/planIO";
import type { CatalogProgram } from "@/lib/types";
import { snapshotV2FromState, usePlannerStore } from "@/store/plannerStore";

const START_YEARS = [2022, 2023, 2024, 2025, 2026, 2027, 2028];

type PlannerHeaderProps = {
  guideButtonRef?: RefObject<HTMLButtonElement | null>;
  onGuide: () => void;
  onImportFile: (file: File) => void;
};

export function PlannerHeader({
  guideButtonRef,
  onGuide,
  onImportFile,
}: PlannerHeaderProps) {
  const { programs, bootstrap } = useCatalog();
  const derived = usePlanDerived();
  const { progress } = derived;
  const programProfile = usePlannerStore((state) => state.programProfile);
  const setProgramProfile = usePlannerStore((state) => state.setProgramProfile);
  const startYear = usePlannerStore((state) => state.startYear);
  const setStartYear = usePlannerStore((state) => state.setStartYear);
  const reset = usePlannerStore((state) => state.reset);
  const { resolvedTheme, setTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const catalogPrograms = programs.filter(
    (program): program is CatalogProgram => "auditAuthority" in program,
  );
  const currentPlanLabel = programProfileLabel(programProfile, catalogPrograms);

  const resetPlan = () => {
    if (window.confirm("Clear the entire plan? This cannot be undone.")) {
      reset();
      toast.success("Plan cleared");
    }
  };

  const currentSnapshot = () =>
    snapshotV2FromState(usePlannerStore.getState(), bootstrap.release.id)!;

  const exportReadable = async (format: "xlsx" | "pdf") => {
    if (exporting) return;
    setExporting(format);
    const label = format === "xlsx" ? "Excel" : "PDF";
    const loadingToast = toast.loading(`Preparing ${label} export…`);
    try {
      const snapshot = currentSnapshot();
      const model = buildPlanExportModel(snapshot, derived);
      const [{ downloadBytes }, renderer] = await Promise.all([
        import("@/lib/planExport/download"),
        format === "xlsx"
          ? import("@/lib/planExport/excel")
          : import("@/lib/planExport/pdf"),
      ]);
      const bytes = format === "xlsx"
        ? await (renderer as typeof import("@/lib/planExport/excel")).renderPlanExcel(model)
        : await (renderer as typeof import("@/lib/planExport/pdf")).renderPlanPdf(model);
      downloadBytes(
        bytes,
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
        planExportFilename(model, format),
      );
      toast.success(`${label} export ready`, { id: loadingToast });
    } catch {
      toast.error(`Could not prepare the ${label} export.`, { id: loadingToast });
    } finally {
      setExporting(null);
    }
  };

  return (
    <header className="functional-glass sticky top-0 z-[var(--z-sticky)] flex min-h-20 items-center gap-2 border-x-0 border-t-0 px-2 py-2.5 shadow-[0_8px_30px_rgb(31_24_36/8%)] sm:gap-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:size-11">
          <GraduationCap className="size-5" aria-hidden="true" />
        </div>
        <div className="hidden min-w-0 flex-col sm:flex">
          <h1 className="truncate text-[17px] leading-5 font-semibold tracking-[-0.015em]">
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

        <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
          <ProgramProfileSummary profile={programProfile} programs={catalogPrograms} onClick={() => setProfileOpen(true)} />
          <Select
            value={String(startYear)}
            onValueChange={(value) => setStartYear(Number(value))}
          >
            <SelectTrigger
              aria-label="Entry year"
              className="h-11 w-52 min-w-24 shrink text-sm [&>span]:truncate"
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
            ref={guideButtonRef}
            type="button"
            variant="outline"
            className="h-11 px-3"
            aria-label="Guide"
            onClick={onGuide}
          >
            <BookOpen aria-hidden="true" />
            <span className="hidden sm:inline">Guide</span><span className="sr-only sm:hidden">Guide</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" className="h-11 px-3" aria-label="Help" />}>
              <CircleHelp aria-hidden="true" /><span className="hidden xl:inline">Help</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Planner support</DropdownMenuLabel>
                <DropdownMenuItem className="min-h-11" onClick={() => setReportOpen(true)}><AlertCircle aria-hidden="true" />Report another issue</DropdownMenuItem>
                <DropdownMenuItem className="min-h-11" onClick={() => setReportsOpen(true)}><BookOpen aria-hidden="true" />My reports</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

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
            <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-1rem)]">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Plan actions</DropdownMenuLabel>
                <DropdownMenuItem className="min-h-11 lg:hidden" onClick={() => setProfileOpen(true)}>
                  <GraduationCap aria-hidden="true" />
                  Edit Program Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload aria-hidden="true" />
                  Import plan
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11"
                  onClick={() => downloadPlanJson(currentSnapshot(), startYear)}
                >
                  <FileJson aria-hidden="true" />
                  Export JSON backup
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11"
                  disabled={exporting !== null}
                  onClick={() => void exportReadable("xlsx")}
                >
                  <FileSpreadsheet aria-hidden="true" />
                  Export Excel workbook
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11"
                  disabled={exporting !== null}
                  onClick={() => void exportReadable("pdf")}
                >
                  <FileText aria-hidden="true" />
                  Export PDF report
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
          <AuthControl onOpenReport={(id) => { setSelectedReportId(id); setReportsOpen(true); }} />
        </div>
      </nav>
      <ProgramProfileSheet
        open={profileOpen}
        onOpenChange={setProfileOpen}
        programs={catalogPrograms}
        profile={programProfile}
        onSave={setProgramProfile}
      />
      <ReportIssueDialog open={reportOpen} onOpenChange={setReportOpen} context={{ target: { kind: "other", area: "planner" }, catalogReleaseId: bootstrap?.release?.id ?? null, label: "NYUSH Degree Planner", displayedValue: "General catalog or degree-planning issue" }} onSubmitted={() => setReportsOpen(true)} />
      <MyReportsSheet open={reportsOpen} onOpenChange={(open) => { setReportsOpen(open); if (!open) setSelectedReportId(null); }} initialReportId={selectedReportId} />
    </header>
  );
}

function AuthControl({ onOpenReport }: { onOpenReport(id: string): void }) {
  const { data: session, status } = useSession();
  if (status === "authenticated" && session?.user) {
    const label = session.user.email ?? "Account";
    return (
      <>
        <NotificationMenu onOpenReport={onOpenReport} />
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
