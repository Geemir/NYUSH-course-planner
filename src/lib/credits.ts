import type { Course, Placement } from "@/lib/types";

export function placementCredits(placement: Placement, course: Course): number {
  const minimum = course.minCredits ?? course.credits;
  const maximum = course.maxCredits ?? course.credits;
  const selected = placement.selectedCredits;
  return selected !== undefined && selected >= minimum && selected <= maximum
    ? selected
    : course.credits;
}
