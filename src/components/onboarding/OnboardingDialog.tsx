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
import { useLocale } from "@/components/i18n/LocaleProvider";
import { useReducedMotion } from "@/hooks/useReducedMotion";
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
import type { TranslationKey } from "@/lib/i18n/types";

type GuideStep = {
  title: TranslationKey;
  description: TranslationKey;
  detail: TranslationKey;
  icon: LucideIcon;
};

const GUIDE_STEPS: readonly GuideStep[] = [
  {
    title: "onboarding.programTitle",
    description: "onboarding.programDescription",
    detail: "onboarding.programDetail",
    icon: GraduationCap,
  },
  {
    title: "onboarding.findTitle",
    description: "onboarding.findDescription",
    detail: "onboarding.findDetail",
    icon: Search,
  },
  {
    title: "onboarding.timelineTitle",
    description: "onboarding.timelineDescription",
    detail: "onboarding.timelineDetail",
    icon: CalendarRange,
  },
  {
    title: "onboarding.progressTitle",
    description: "onboarding.progressDescription",
    detail: "onboarding.progressDetail",
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
  const { t } = useLocale();
  const [stepIndex, setStepIndex] = useState(0);
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(
    null,
  );
  const directionRef = useRef<GuideMotionDirection>("enter");
  const reducedMotion = useReducedMotion();

  const step = GUIDE_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === GUIDE_STEPS.length - 1;
  const StepIcon = step.icon;
  useEffect(() => {
    if (!open || !contentElement) return;
    const animation = animateGuideStep(
      contentElement,
      directionRef.current,
      reducedMotion,
    );
    return () => animation?.cancel();
  }, [contentElement, open, reducedMotion, stepIndex]);

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
              {t("onboarding.step", { current: stepIndex + 1, total: GUIDE_STEPS.length })}
            </p>
            <div
              className="flex gap-1.5"
              aria-label={t("onboarding.progress", { current: stepIndex + 1, total: GUIDE_STEPS.length })}
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
              {t(step.title)}
            </DialogTitle>
            <DialogDescription className="mt-2 text-base leading-6 text-foreground">
              {t(step.description)}
            </DialogDescription>
            <p className="mt-3 max-w-[58ch] text-sm leading-6 text-muted-foreground">
              {t(step.detail)}
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
            {t("onboarding.skip")}
          </Button>
          <div className="flex gap-2">
            {!isFirst && (
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 px-5 sm:flex-none"
                onClick={() => moveToStep("backward")}
              >
                {t("onboarding.back")}
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
              {isLast ? t("onboarding.done") : t("onboarding.next")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
