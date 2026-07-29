"use client";

import { BookOpenCheck, CheckCircle2, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/components/i18n/LocaleProvider";

export function ProgressGuide({
  open,
  onOpenChange,
  onComplete,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onComplete(): void;
}) {
  const { t } = useLocale();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-1.5rem)] gap-5 sm:max-w-lg">
        <div>
          <DialogTitle className="text-xl tracking-tight">{t("progress.guideTitle")}</DialogTitle>
          <DialogDescription className="mt-2 leading-6">
            {t("progress.guideDescription")}
          </DialogDescription>
        </div>
        <div className="grid gap-3">
          <div className="flex gap-3 rounded-xl bg-muted/55 p-3.5">
            <ListChecks className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div><p className="text-sm font-semibold">{t("progress.guideRemainingTitle")}</p><p className="mt-0.5 text-sm leading-5 text-muted-foreground">{t("progress.guideRemaining")}</p></div>
          </div>
          <div className="flex gap-3 rounded-xl bg-muted/55 p-3.5">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div><p className="text-sm font-semibold">{t("progress.guideManualTitle")}</p><p className="mt-0.5 text-sm leading-5 text-muted-foreground">{t("progress.guideManual")}</p></div>
          </div>
          <div className="flex gap-3 rounded-xl bg-muted/55 p-3.5">
            <BookOpenCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div><p className="text-sm font-semibold">{t("progress.guideVerifyTitle")}</p><p className="mt-0.5 text-sm leading-5 text-muted-foreground">{t("progress.guideVerify")}</p></div>
          </div>
        </div>
        <Button type="button" className="h-11 w-full sm:ml-auto sm:w-auto" onClick={onComplete}>{t("progress.guideGotIt")}</Button>
      </DialogContent>
    </Dialog>
  );
}
