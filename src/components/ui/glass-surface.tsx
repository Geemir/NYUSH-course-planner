"use client";

import { cloneElement, forwardRef, isValidElement, type HTMLAttributes, type ReactElement } from "react";
import { cn } from "@/lib/utils";

export interface GlassSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  strength?: "subtle" | "strong";
  elevation?: "floating" | "overlay";
  asChild?: boolean;
  "data-content-surface"?: boolean | "";
}

export const GlassSurface = forwardRef<HTMLDivElement, GlassSurfaceProps>(function GlassSurface({
  strength = "subtle", elevation = "floating", asChild = false, className, children, ...props
}, ref) {
  const contentSurface = props["data-content-surface"] !== undefined;
  const classes = cn(
    contentSurface ? "bg-card text-card-foreground" : "functional-glass",
    !contentSurface && strength === "strong" && "functional-glass-strong",
    !contentSurface && elevation === "overlay" ? "shadow-[0_20px_60px_rgb(31_24_36/18%)]" : "shadow-[0_8px_30px_rgb(31_24_36/10%)]",
    className,
  );
  if (asChild) {
    if (!isValidElement(children)) throw new Error("GlassSurface asChild requires one element.");
    const child = children as ReactElement<{ className?: string }>;
    return cloneElement(child, { ...props, className: cn(classes, child.props.className), ref } as never);
  }
  return <div ref={ref} className={classes} {...props}>{children}</div>;
});
