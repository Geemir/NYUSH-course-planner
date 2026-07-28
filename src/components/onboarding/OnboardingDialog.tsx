"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  CalendarRange,
  ChartNoAxesCombined,
  GraduationCap,
  Search,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  animateGuideStep,
  type GuideMotionDirection,
} from "@/lib/guideMotion";

type GuideStep = {
  title: string;
  description: string;
  detail: string;
  icon: LucideIcon;
};

const GUIDE_STEPS: readonly GuideStep[] = [
  {
    title: "Choose your program",
    description: "Start with the academic context that shapes your plan.",
    detail:
      "Set your primary major, optional second major and minors, plus entry year. The planner keeps NYUSH degree authority separate from study-away course discovery.",
    icon: GraduationCap,
  },
  {
    title: "Find courses",
    description: "Explore the Bulletin catalog with purpose.",
    detail:
      "Search NYU Shanghai courses and New York study-away catalogs. New York results are clearly catalog-only until availability and eligibility are confirmed.",
    icon: Search,
  },
  {
    title: "Build your timeline",
    description: "Turn possibilities into a four-year sequence.",
    detail:
      "Drag courses into semesters, or use the assignment menu for the same planning control without dragging.",
    icon: CalendarRange,
  },
  {
    title: "Read your progress",
    description: "Check the plan from more than one angle.",
    detail:
      "Compare planned and earned credits, inspect Bulletin evidence, and use Help for reports, sync status, Undo, and My reports. Guidance is not an official NYU decision.",
    icon: ChartNoAxesCombined,
  },
] as const;

type OnboardingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export function OnboardingDialog({
  open,
  onOpenChange,
  onComplete,
  returnFocusRef,
}: OnboardingDialogProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(
    null,
  );
  const directionRef = useRef<GuideMotionDirection>("enter");

  const step = GUIDE_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === GUIDE_STEPS.length - 1;
  const StepIcon = step.icon;
  useEffect(() => {
    if (!open || !contentElement) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const animation = animateGuideStep(
      contentElement,
      directionRef.current,
      reduceMotion,
    );
    return () => animation?.cancel();
  }, [contentElement, open, stepIndex]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      directionRef.current = "enter";
      setStepIndex(0);
    }
    onOpenChange(nextOpen);
  };
  const handleComplete = () => {
    directionRef.current = "enter";
    setStepIndex(0);
    onComplete();
  };
  const moveToStep = (direction: "forward" | "backward") => {
    directionRef.current = direction;
    setStepIndex((current) =>
      current + (direction === "forward" ? 1 : -1),
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        finalFocus={returnFocusRef}
        showCloseButton={false}
        className="max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <div className="p-5 sm:p-6">
          <div className="mb-7 flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-muted-foreground">
              Step {stepIndex + 1} of {GUIDE_STEPS.length}
            </p>
            <div
              className="flex gap-1.5"
              aria-label={`Guide progress: step ${stepIndex + 1} of ${GUIDE_STEPS.length}`}
            >
              {GUIDE_STEPS.map((guideStep, index) => (
                <span
                  key={guideStep.title}
                  className={cn(
                    "h-1.5 w-7 rounded-full bg-border transition-colors motion-reduce:transition-none",
                    index <= stepIndex && "bg-primary",
                  )}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>

          <div ref={setContentElement}>
            <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <StepIcon className="size-6" aria-hidden="true" />
            </div>
            <DialogTitle className="text-xl leading-tight font-semibold tracking-[-0.02em]">
              {step.title}
            </DialogTitle>
            <DialogDescription className="mt-2 text-base leading-6 text-foreground">
              {step.description}
            </DialogDescription>
            <p className="mt-3 max-w-[58ch] text-sm leading-6 text-muted-foreground">
              {step.detail}
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="h-11 px-4"
            onClick={handleComplete}
          >
            Skip guide
          </Button>
          <div className="flex gap-2">
            {!isFirst && (
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 px-5 sm:flex-none"
                onClick={() => moveToStep("backward")}
              >
                Back
              </Button>
            )}
            <Button
              type="button"
              className="h-11 flex-1 px-5 sm:flex-none"
              onClick={
                isLast
                  ? handleComplete
                  : () => moveToStep("forward")
              }
            >
              {isLast ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
