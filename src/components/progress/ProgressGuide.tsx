"use client";

import { BookOpenCheck, CheckCircle2, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function ProgressGuide({
  open,
  onOpenChange,
  onComplete,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onComplete(): void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-1.5rem)] gap-5 sm:max-w-lg">
        <div>
          <DialogTitle className="text-xl tracking-tight">Understand your degree progress</DialogTitle>
          <DialogDescription className="mt-2 leading-6">
            See what is complete, planned, and still missing for each program.
          </DialogDescription>
        </div>
        <div className="grid gap-3">
          <div className="flex gap-3 rounded-xl bg-muted/55 p-3.5">
            <ListChecks className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div><p className="text-sm font-semibold">Review what remains</p><p className="mt-0.5 text-sm leading-5 text-muted-foreground">Open a program to see matched courses and remaining choices.</p></div>
          </div>
          <div className="flex gap-3 rounded-xl bg-muted/55 p-3.5">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div><p className="text-sm font-semibold">Add your own status</p><p className="mt-0.5 text-sm leading-5 text-muted-foreground">Mark a requirement planned or fulfilled when the automatic calculation cannot capture it.</p></div>
          </div>
          <div className="flex gap-3 rounded-xl bg-muted/55 p-3.5">
            <BookOpenCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div><p className="text-sm font-semibold">Verify with the Bulletin</p><p className="mt-0.5 text-sm leading-5 text-muted-foreground">Use the source link before making an important academic decision.</p></div>
          </div>
        </div>
        <Button type="button" className="h-11 w-full sm:ml-auto sm:w-auto" onClick={onComplete}>Got it</Button>
      </DialogContent>
    </Dialog>
  );
}
