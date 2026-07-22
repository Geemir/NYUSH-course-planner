"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  INSPIRATION_QUOTES,
  INSPIRATION_QUOTE_KEY,
  nextQuote,
  selectSessionQuote,
  type InspirationQuote,
} from "@/lib/inspirationQuotes";

export function InspirationStrip() {
  const [quote, setQuote] = useState<InspirationQuote>(INSPIRATION_QUOTES[0]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setQuote(selectSessionQuote(window.sessionStorage));
      } catch {
        // The deterministic first quote remains available when storage is blocked.
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const showNextQuote = useCallback(() => {
    setQuote((current) => {
      const next = nextQuote(current.id);
      try {
        window.sessionStorage.setItem(INSPIRATION_QUOTE_KEY, next.id);
      } catch {
        // Refresh still works for this render when storage is unavailable.
      }
      return next;
    });
  }, []);

  return (
    <section
      aria-label="Planning inspiration"
      className="relative isolate min-h-48 overflow-hidden rounded-xl bg-foreground text-white"
    >
      <Image
        src="/nyc-skyline-diane-picchiottino.jpg"
        alt=""
        fill
        sizes="100vw"
        className="-z-20 scale-105 object-cover object-[center_42%] blur-[2px]"
      />
      <div
        className="skyline-overlay absolute inset-0 -z-10"
        aria-hidden="true"
      />

      <div className="flex min-h-48 max-w-5xl flex-col justify-center gap-6 px-5 py-7 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        <blockquote aria-live="polite" className="max-w-[62ch]">
          <p className="text-xl leading-8 font-medium tracking-[-0.02em] text-pretty sm:text-2xl sm:leading-9">
            “{quote.text}”
          </p>
        </blockquote>

        <Button
          type="button"
          variant="ghost"
          className="h-11 w-fit shrink-0 bg-black/20 px-4 text-white transition-colors duration-[var(--motion-fast)] hover:bg-white/15 hover:text-white focus-visible:border-white/60 focus-visible:ring-white/50"
          aria-label="Show another thought"
          onClick={showNextQuote}
        >
          <RefreshCw aria-hidden="true" />
          Another thought
        </Button>
      </div>
    </section>
  );
}
