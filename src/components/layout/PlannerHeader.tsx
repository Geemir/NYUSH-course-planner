"use client";

import { useRef, useState, type RefObject } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  BookOpen,
  Check,
  CircleHelp,
  FileJson,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Info,
  LogIn,
  LogOut,
  Menu,
  Moon,
  RotateCcw,
  Shield,
  Sun,
  Upload,
  Undo2,
} from "lucide-react";
import { ReportIssueDialog } from "@/components/corrections/ReportIssueDialog";
import { LanguageControl } from "@/components/i18n/LanguageControl";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { MyReportsSheet } from "@/components/corrections/MyReportsSheet";
import { NotificationMenu } from "@/components/corrections/NotificationMenu";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useCatalog } from "@/components/CatalogProvider";
import { ProgramProfileSheet } from "@/components/programs/ProgramProfileSheet";
import { ProgramProfileSummary } from "@/components/programs/ProgramProfileSummary";
import { UndoButton } from "@/components/layout/UndoButton";
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
  const { t } = useLocale();
  const derived = usePlanDerived();
  const { progress } = derived;
  const programProfile = usePlannerStore((state) => state.programProfile);
  const setProgramProfile = usePlannerStore((state) => state.setProgramProfile);
  const startYear = usePlannerStore((state) => state.startYear);
  const setStartYear = usePlannerStore((state) => state.setStartYear);
  const reset = usePlannerStore((state) => state.reset);
  const undo = usePlannerStore((state) => state.undo);
  const canUndo = usePlannerStore((state) => state.canUndo);
  const undoLabel = usePlannerStore((state) => state.undoLabel);
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
  const resetPlan = () => {
    if (window.confirm(t("header.clearConfirm"))) {
      reset();
      toast.success(t("header.cleared"));
    }
  };

  const currentSnapshot = () =>
    snapshotV2FromState(usePlannerStore.getState(), bootstrap.release.id)!;

  const exportReadable = async (format: "xlsx" | "pdf") => {
    if (exporting) return;
    setExporting(format);
    const label = format === "xlsx" ? "Excel" : "PDF";
    const loadingToast = toast.loading(t("header.preparingExport", { format: label }));
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
      toast.success(t("header.exportReady", { format: label }), { id: loadingToast });
    } catch {
      toast.error(t("header.exportError", { format: label }), { id: loadingToast });
    } finally {
      setExporting(null);
    }
  };

  return (
    <header data-header-order className="functional-glass sticky top-0 z-[var(--z-sticky)] flex min-h-20 items-center gap-2 border-x-0 border-t-0 px-2 py-2.5 shadow-[0_8px_30px_rgb(31_24_36/8%)] sm:gap-4 sm:px-6">
      <Link href="/" data-header-part="logo" aria-label="NYUSH Degree Planner home" className="flex h-11 w-20 shrink-0 items-center sm:w-28">
        <div className="flex h-full w-full items-center">
          <Image src="/nyu-violets-logo.png" alt="NYU Violets" width={112} height={56} priority className="h-auto w-full object-contain" />
        </div>
      </Link>
      <LanguageControl />

      <nav
        data-header-part="controls"
        aria-label={t("header.controls")}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <Badge
          variant="secondary"
          className="hidden h-8 shrink-0 px-3 text-sm tabular-nums md:inline-flex"
        >
          {t("header.credits", { planned: progress.credits.planned, goal: progress.credits.goal })}
        </Badge>

        {/* The profile drives every requirement on the page, so it stays visible
            at all widths; only the entry-year select collapses on small screens. */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ProgramProfileSummary profile={programProfile} programs={catalogPrograms} onClick={() => setProfileOpen(true)} />
          <Select
            value={String(startYear)}
            onValueChange={(value) => setStartYear(Number(value))}
          >
            <SelectTrigger
              aria-label={t("header.entryYear")}
              className="hidden h-11 w-52 min-w-24 shrink text-sm lg:flex [&>span]:truncate"
            >
              <SelectValue>
                {(value: string) =>
                  t("header.entered", { year: value, classYear: Number(value) + 4 })
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {START_YEARS.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {t("header.entered", { year, classYear: year + 4 })}
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
            aria-label={t("header.guide")}
            onClick={onGuide}
          >
            <BookOpen aria-hidden="true" />
            <span className="hidden sm:inline">{t("header.guide")}</span><span className="sr-only sm:hidden">{t("header.guide")}</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" className="hidden h-11 px-3 sm:inline-flex" aria-label={t("header.help")} />}>
              <CircleHelp aria-hidden="true" /><span className="hidden xl:inline">{t("header.help")}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t("header.support")}</DropdownMenuLabel>
                <DropdownMenuItem className="min-h-11" onClick={() => setReportOpen(true)}><AlertCircle aria-hidden="true" />{t("header.report")}</DropdownMenuItem>
                <DropdownMenuItem className="min-h-11" onClick={() => setReportsOpen(true)}><BookOpen aria-hidden="true" />{t("header.reports")}</DropdownMenuItem>
                <DropdownMenuItem className="min-h-11" render={<a href="/about" />}><Info aria-hidden="true" />{t("header.about")}</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  className="h-11 min-w-11 px-3"
                  aria-label={t("header.actions")}
                />
              }
            >
              <Menu aria-hidden="true" />
              <span className="hidden xl:inline">{t("header.actions")}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-1rem)]">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t("header.actions")}</DropdownMenuLabel>
                <DropdownMenuItem className="min-h-11 sm:hidden" disabled={!canUndo} onClick={undo}>
                  <Undo2 aria-hidden="true" />
                  {undoLabel ? `Undo: ${undoLabel}` : "Undo unavailable"}
                </DropdownMenuItem>
                <DropdownMenuItem className="min-h-11 lg:hidden" onClick={() => setProfileOpen(true)}>
                  <GraduationCap aria-hidden="true" />
                  {t("header.editProfile")}
                </DropdownMenuItem>
                {/* The entry-year select lives in the header only from lg up, so
                    without these the class year is unreachable on a phone. */}
                <div className="lg:hidden">
                  <DropdownMenuLabel>{t("header.entryYear")}</DropdownMenuLabel>
                  {START_YEARS.map((year) => (
                    <DropdownMenuItem
                      key={year}
                      className="min-h-11"
                      onClick={() => setStartYear(year)}
                    >
                      {year === startYear ? (
                        <Check aria-hidden="true" />
                      ) : (
                        <span className="size-4" aria-hidden="true" />
                      )}
                      {t("header.entered", { year, classYear: year + 4 })}
                    </DropdownMenuItem>
                  ))}
                </div>
                <DropdownMenuItem className="min-h-11 sm:hidden" onClick={() => setReportOpen(true)}>
                  <AlertCircle aria-hidden="true" />
                  {t("header.report")}
                </DropdownMenuItem>
                <DropdownMenuItem className="min-h-11 sm:hidden" onClick={() => setReportsOpen(true)}>
                  <BookOpen aria-hidden="true" />
                  {t("header.reports")}
                </DropdownMenuItem>
                <DropdownMenuItem className="min-h-11 lg:hidden" render={<a href="/about" />}>
                  <Info aria-hidden="true" />
                  {t("header.about")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11 sm:hidden"
                  onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                >
                  {resolvedTheme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
                  {t("header.theme")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload aria-hidden="true" />
                  {t("header.import")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11"
                  onClick={() => downloadPlanJson(currentSnapshot(), startYear)}
                >
                  <FileJson aria-hidden="true" />
                  {t("header.exportJson")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11"
                  disabled={exporting !== null}
                  onClick={() => void exportReadable("xlsx")}
                >
                  <FileSpreadsheet aria-hidden="true" />
                  {t("header.exportExcel")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11"
                  disabled={exporting !== null}
                  onClick={() => void exportReadable("pdf")}
                >
                  <FileText aria-hidden="true" />
                  {t("header.exportPdf")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                className="min-h-11"
                onClick={resetPlan}
              >
                <RotateCcw aria-hidden="true" />
                {t("header.reset")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="hidden sm:block"><UndoButton /></div>

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
            className="hidden size-11 sm:inline-flex"
            aria-label={t("header.theme")}
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
  const { t } = useLocale();
  if (status === "authenticated" && session?.user) {
    const label = session.user.email ?? t("header.account");
    return (
      <>
        <NotificationMenu onOpenReport={onOpenReport} />
        {(session.user.role === "admin" || session.user.role === "maintainer") && (
          <Button
            variant="outline"
            className="h-11 px-3"
            nativeButton={false}
            render={<a href="/admin" />}
          >
            <Shield aria-hidden="true" />
            <span className="hidden xl:inline">{session.user.role === "admin" ? "Admin" : "Maintain"}</span>
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
      aria-label={t("header.signIn")}
      nativeButton={false}
      render={<a href="/signin" />}
    >
      <LogIn aria-hidden="true" />
      <span className="hidden xl:inline">{t("header.signIn")}</span>
    </Button>
  );
}
