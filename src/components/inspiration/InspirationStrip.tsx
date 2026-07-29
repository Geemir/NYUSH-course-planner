"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  INSPIRATION_QUOTES,
  INSPIRATION_QUOTE_KEY,
  nextQuote,
  selectSessionQuote,
  type InspirationQuote,
} from "@/lib/inspirationQuotes";
import {
  animateQuoteEnter,
  animateQuoteExit,
  animateRefreshIcon,
  startQuoteAmbient,
  type MotionHandle,
} from "@/lib/motion/productMotion";

export function InspirationStrip() {
  const [quote, setQuote] = useState<InspirationQuote>(INSPIRATION_QUOTES[0]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const quoteRef = useRef<HTMLQuoteElement>(null);
  const iconRef = useRef<SVGSVGElement>(null);
  const ambientRef = useRef<MotionHandle | null>(null);
  const activeRef = useRef<MotionHandle[]>([]);
  const transitioningRef = useRef(false);
  const mountedRef = useRef(true);
  const hydrationTimerRef = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    hydrationTimerRef.current = window.setTimeout(() => {
      try {
        setQuote(selectSessionQuote(window.sessionStorage));
      } catch {
        // The deterministic first quote remains available when storage is blocked.
      }
    }, 0);
    return () => {
      if (hydrationTimerRef.current !== null) window.clearTimeout(hydrationTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const element = quoteRef.current;
    if (element && !reducedMotion) ambientRef.current = startQuoteAmbient(element, false);
    return () => {
      ambientRef.current?.cancel();
      ambientRef.current = null;
    };
  }, [quote.id, reducedMotion]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRef.current.forEach((motion) => motion.cancel());
      activeRef.current = [];
    };
  }, []);

  const showNextQuote = useCallback(async () => {
    if (transitioningRef.current) return;
    if (hydrationTimerRef.current !== null) {
      window.clearTimeout(hydrationTimerRef.current);
      hydrationTimerRef.current = null;
    }
    transitioningRef.current = true;
    setIsTransitioning(true);
    const next = nextQuote(quote.id);
    const persist = () => {
      try {
        window.sessionStorage.setItem(INSPIRATION_QUOTE_KEY, next.id);
      } catch {
        // Refresh still works for this render when storage is unavailable.
      }
      setQuote(next);
    };

    if (reducedMotion || !quoteRef.current) {
      persist();
      transitioningRef.current = false;
      setIsTransitioning(false);
      return;
    }

    ambientRef.current?.cancel();
    const exit = animateQuoteExit(quoteRef.current, false);
    activeRef.current = [exit];
    await exit.finished;
    if (!mountedRef.current) return;
    persist();
    if (!mountedRef.current || !quoteRef.current) return;
    const enter = animateQuoteEnter(quoteRef.current, false);
    const icon = iconRef.current ? animateRefreshIcon(iconRef.current, false) : null;
    activeRef.current = icon ? [enter, icon] : [enter];
    await enter.finished;
    if (mountedRef.current) {
      activeRef.current = [];
      transitioningRef.current = false;
      setIsTransitioning(false);
    }
  }, [quote.id, reducedMotion]);

  return (
    <section aria-label="Planning inspiration" className="relative isolate min-h-48 overflow-hidden rounded-xl bg-foreground text-white">
      <Image src="/nyc-skyline-diane-picchiottino.jpg" alt="" fill sizes="100vw" className="-z-20 scale-105 object-cover object-[center_42%] blur-[2px]" />
      <div className="skyline-overlay absolute inset-0 -z-10" aria-hidden="true" />
      <div className="flex min-h-48 max-w-5xl flex-col justify-center gap-6 px-5 py-7 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        <blockquote ref={quoteRef} className="max-w-[62ch]">
          <p className="text-xl leading-8 font-medium tracking-[-0.02em] text-pretty sm:text-2xl sm:leading-9">
            <span aria-live="polite">“{quote.text}”</span>
          </p>
        </blockquote>
        <Button type="button" variant="ghost" className="h-11 w-fit shrink-0 bg-black/20 px-4 text-white transition-colors duration-[var(--motion-fast)] hover:bg-white/15 hover:text-white focus-visible:border-white/60 focus-visible:ring-white/50" aria-label="Show another thought" onClick={showNextQuote} disabled={isTransitioning}>
          <RefreshCw ref={iconRef} aria-hidden="true" />
          Another thought
        </Button>
      </div>
    </section>
  );
}
