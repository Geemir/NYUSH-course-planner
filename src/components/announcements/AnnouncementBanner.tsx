"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CircleAlert, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { PublicAnnouncement } from "@/lib/announcements/types";
import { animateAnnouncementEnter, animateAnnouncementExit, type MotionHandle } from "@/lib/motion/productMotion";
import { cn } from "@/lib/utils";

const dismissalKey = (id: string) => `nyush-planner:announcement-dismissed:${id}`;
const toneStyles = {
  info: { label: "Information", icon: Info, className: "border-primary/20 bg-primary/[0.06] text-foreground" },
  warning: { label: "Warning", icon: CircleAlert, className: "border-amber-500/30 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" },
  critical: { label: "Important", icon: AlertCircle, className: "border-destructive/30 bg-destructive/[0.07] text-foreground" },
} as const;

export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<PublicAnnouncement | null>(null);
  const elementRef = useRef<HTMLElement>(null);
  const motionRef = useRef<MotionHandle | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/announcements/current", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Announcement unavailable")))
      .then(({ announcement: current }: { announcement: PublicAnnouncement | null }) => {
        if (!current) return;
        try {
          if (window.localStorage.getItem(dismissalKey(current.id))) return;
        } catch {
          // The announcement remains visible if storage access is unavailable.
        }
        setAnnouncement(current);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!announcement || !elementRef.current) return;
    motionRef.current = animateAnnouncementEnter(elementRef.current, reducedMotion);
    return () => motionRef.current?.cancel();
  }, [announcement, reducedMotion]);

  if (!announcement) return null;
  const tone = toneStyles[announcement.tone];
  const ToneIcon = tone.icon;

  const dismiss = async () => {
    if (elementRef.current) {
      const motion = animateAnnouncementExit(elementRef.current, reducedMotion);
      motionRef.current = motion;
      await motion.finished;
    }
    try {
      window.localStorage.setItem(dismissalKey(announcement.id), "true");
    } catch {
      // Dismiss for this page even when persistence is blocked.
    }
    setAnnouncement(null);
  };

  return (
    <div className="mx-auto w-full max-w-[var(--content-max-width)] px-4 pt-4 sm:px-6 sm:pt-5">
      <section ref={elementRef} role="region" aria-label="Planner announcement" className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3 shadow-sm sm:flex-row sm:items-start", tone.className)}>
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <ToneIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide uppercase opacity-70">{tone.label}</p>
            <h2 className="mt-0.5 text-sm font-semibold sm:text-base">{announcement.title}</h2>
            <p className="mt-1 whitespace-pre-line text-sm leading-6 opacity-85">{announcement.body}</p>
            {announcement.linkUrl && (
              <a href={announcement.linkUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
                {announcement.linkLabel ?? "Learn more"}
              </a>
            )}
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 self-end sm:-mt-1 sm:-mr-1 sm:self-start" aria-label="Dismiss announcement" onClick={dismiss}>
          <X aria-hidden="true" />
        </Button>
      </section>
    </div>
  );
}
