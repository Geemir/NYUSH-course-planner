"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";

/**
 * Always-available floating entry to /about. It sits bottom-left so it never
 * collides with the centred WorkspaceTools cluster, and stays reachable at every
 * width (the Help menu item alone was too easy to miss).
 */
export function FloatingAboutButton() {
  const { t } = useLocale();
  return (
    <div
      className="pointer-events-none fixed left-4 z-[var(--z-sticky)]"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <Button
        variant="outline"
        className="functional-glass pointer-events-auto h-11 rounded-2xl px-3 shadow-[0_12px_35px_rgb(31_24_36/16%)]"
        aria-label={t("header.about")}
        nativeButton={false}
        render={<Link href="/about" />}
      >
        <Info aria-hidden="true" />
        <span className="hidden sm:inline">{t("header.about")}</span>
      </Button>
    </div>
  );
}
